import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyTeacherDocumentToken } from "@/lib/publicAccessToken";
import {
  DOC_STATUS,
  TEACHER_DOC_LABELS,
  TEACHER_DOC_TYPES,
  isTeacherDocType,
  listTeacherDocuments,
  upsertTeacherDocument,
} from "@/lib/teacherDocument";
import { deleteSensitiveDocument, putSensitiveDocument, validateSensitiveFile } from "@/lib/sensitiveBlob";
import { ensureTeacherExtendedColumns } from "@/lib/teacherColumns";
import { writeAuditLog } from "@/lib/auditLog";
import { getAppSetting } from "@/lib/appSetting";

export const runtime = "nodejs";

type Params = { token: string } | Promise<{ token: string }>;

// 老師正常補件一小時內不會超過這個數字；超過就是有人在洗版
const PUBLIC_UPLOAD_LIMIT_PER_HOUR = 12;

// Teacher.name 是唯一鍵，稽核紀錄的 actorName 就是老師本人，拿來當計數依據夠穩定
async function recentUploadCount(teacherName: string) {
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const rows = await prisma.$queryRawUnsafe<Array<{ total: number }>>(
    `SELECT COUNT(*) as total FROM "AuditLog"
      WHERE "targetType" = 'TeacherDocument' AND "actorRole" = 'teacher_public_link'
        AND "action" = 'create' AND "actorName" = ? AND "createdAt" >= ?`,
    teacherName,
    since,
  ).catch(() => []);
  return Number(rows[0]?.total ?? 0);
}

async function teacherFromToken(params: Params) {
  const { token } = await params;
  let teacherId: number;
  let epoch: number;
  try {
    ({ teacherId, epoch } = verifyTeacherDocumentToken(decodeURIComponent(token)));
  } catch {
    // 簽章壞掉或已過期：連結問題，不是系統問題
    throw new LinkDeadError("連結已失效，請聯繫行政重新產生");
  }
  await ensureTeacherExtendedColumns();
  const teacher = await prisma.teacher.findUnique({
    where: { id: teacherId },
    select: { id: true, name: true, docLinkEpoch: true },
  });
  // 老師被刪掉時連結也等於失效，不是系統錯誤
  if (!teacher) throw new LinkDeadError("找不到老師資料，請聯繫行政");
  // 連結被行政作廢過：簽章仍然有效，但世代對不上就一律擋掉
  if (epoch !== (teacher.docLinkEpoch ?? 0)) throw new LinkDeadError("連結已作廢，請聯繫行政重新產生");
  return teacher;
}

// 連結本身不能用（過期、簽章壞掉、被作廢）一律回 403。
// 不用關鍵字猜測——BLOB_READ_WRITE_TOKEN 沒設定的錯誤訊息也含 token，猜錯會把系統故障說成連結失效。
class LinkDeadError extends Error {}

// 老師端頁面用：只回自己的文件狀態與範本連結，不回檔案內容也不回其他老師的資料
export async function GET(_req: NextRequest, { params }: { params: Params }) {
  try {
    const teacher = await teacherFromToken(params);
    const documents = await listTeacherDocuments([teacher.id]);
    const mandateTemplateUrl = await getAppSetting("doc.template.mandate.url");
    const bankbookHint = await getAppSetting("doc.template.bankbook.hint");
    return NextResponse.json({
      teacherName: teacher.name,
      documents: TEACHER_DOC_TYPES.map((docType) => {
        const row = documents.find((doc) => doc.docType === docType);
        return {
          docType,
          label: TEACHER_DOC_LABELS[docType],
          reviewStatus: row?.reviewStatus || DOC_STATUS.none,
          fileName: row?.fileName || "",
          uploadedAt: row?.uploadedAt || "",
          notes: row?.notes || "",
        };
      }),
      mandateTemplateUrl,
      bankbookHint,
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || "連結已失效" },
      { status: error instanceof LinkDeadError ? 403 : 500 },
    );
  }
}

export async function POST(req: NextRequest, { params }: { params: Params }) {
  try {
    const teacher = await teacherFromToken(params);
    const form = await req.formData();
    const docType = String(form.get("docType") ?? "");
    const file = form.get("file");
    if (!isTeacherDocType(docType)) return NextResponse.json({ error: "文件類型不正確" }, { status: 400 });
    if (!(file instanceof File)) return NextResponse.json({ error: "請選擇檔案" }, { status: 400 });

    const check = await validateSensitiveFile(file);
    if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });

    // 連結等於憑證，拿到的人可以無限次覆蓋正確文件。用稽核紀錄當計數器擋掉洗版。
    const recent = await recentUploadCount(teacher.name);
    if (recent >= PUBLIC_UPLOAD_LIMIT_PER_HOUR) {
      return NextResponse.json({ error: "上傳次數過於頻繁，請稍後再試或聯繫行政" }, { status: 429 });
    }

    const stored = await putSensitiveDocument({ teacherId: teacher.id, docType, file, ext: check.ext });
    const { row, previousFileUrl } = await upsertTeacherDocument({
      teacherId: teacher.id,
      docType,
      fileUrl: stored.pathname,
      fileName: file.name,
      fileSize: file.size,
      contentType: stored.contentType,
      uploadedBy: `老師自傳：${teacher.name}`,
    });
    if (previousFileUrl) await deleteSensitiveDocument(previousFileUrl);
    await writeAuditLog(req, {
      action: "create",
      actorName: teacher.name,
      actorRole: "teacher_public_link",
      targetType: "TeacherDocument",
      targetId: row?.id ?? teacher.id,
      targetLabel: `${teacher.name}－${TEACHER_DOC_LABELS[docType]}`,
      diffSummary: `老師上傳${TEACHER_DOC_LABELS[docType]}：${teacher.name}`,
      sensitive: true,
    });
    return NextResponse.json({ ok: true, reviewStatus: row?.reviewStatus || DOC_STATUS.pending });
  } catch (error) {
    const dead = error instanceof LinkDeadError;
    return NextResponse.json(
      { error: (error as Error).message || "上傳失敗" },
      { status: dead ? 403 : 500 },
    );
  }
}
