import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { signTeacherResumeToken, verifyTeacherDocumentToken } from "@/lib/publicAccessToken";
import {
  DOC_STATUS,
  TEACHER_DOC_LABELS,
  TEACHER_DOC_TYPES,
  isTeacherDocType,
  listTeacherDocuments,
  upsertTeacherDocument,
} from "@/lib/teacherDocument";
import { putSensitiveDocument, validateSensitiveFile } from "@/lib/sensitiveBlob";
import { deleteSensitiveDocumentOrQueue } from "@/lib/sensitiveBlobDeletionQueue";
import { ensureTeacherExtendedColumns } from "@/lib/teacherColumns";
import { writeAuditLog } from "@/lib/auditLog";
import { getAppSetting } from "@/lib/appSetting";
import { getTeacherResume } from "@/lib/teacherResume";

export const runtime = "nodejs";

type Params = { token: string } | Promise<{ token: string }>;

// 老師正常補件一小時內不會超過這個數字；超過就是有人在洗版
const PUBLIC_UPLOAD_LIMIT_PER_HOUR = 12;

// Teacher.name 是唯一鍵，稽核紀錄的 actorName 就是老師本人，拿來當計數依據夠穩定
//
// 這裡原本傳 toISOString()（"2026-08-04T11:34:56.000Z"）去比 AuditLog.createdAt。
// AuditLog 雖然在 schema.prisma 裡有 model，實際卻是 ensureAuditLogStorage() 建表、
// insertAuditLog() 不寫 createdAt，所以值一律是 SQLite CURRENT_TIMESTAMP 的
// "2026-08-04 12:34:56"。兩個都是 TEXT，但第 11 個字元 ' '(0x20) < 'T'(0x54)，
// 同一天的紀錄永遠排在 ISO 字串前面 → 條件恆為 false → 計數恆為 0，
// 這個每小時 12 次的公開上傳頻率限制等於從來沒有生效過。
// 改成用 SQLite 自己的格式（UTC，和 CURRENT_TIMESTAMP 一致）比對。
async function recentUploadCount(teacherName: string) {
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString().slice(0, 19).replace("T", " ");
  const rows = await prisma.$queryRawUnsafe<Array<{ total: number }>>(
    `SELECT COUNT(*) as total FROM "AuditLog"
      WHERE "targetType" = 'TeacherDocument' AND "actorRole" = 'teacher_public_link'
        AND "action" = 'create' AND "actorName" = ? AND "createdAt" >= ?`,
    teacherName,
    since,
  ).catch((error) => {
    // 原本是靜默 .catch(() => [])，正是這個 bug 活這麼久沒被發現的原因。
    // 仍然放行（查詢壞掉不該讓老師補不了件），但至少要留下痕跡。
    console.error("[teacher-documents] 上傳頻率計數失敗，本次放行：", error);
    return [] as Array<{ total: number }>;
  });
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
// 不用關鍵字猜測——SENSITIVE_READ_WRITE_TOKEN 沒設定的錯誤訊息也含 token，猜錯會把系統故障說成連結失效。
class LinkDeadError extends Error {}

// 老師端頁面用：只回自己的文件狀態與範本連結，不回檔案內容也不回其他老師的資料
export async function GET(_req: NextRequest, { params }: { params: Params }) {
  try {
    const teacher = await teacherFromToken(params);
    const [documents, resume] = await Promise.all([
      listTeacherDocuments([teacher.id]),
      getTeacherResume(teacher.id),
    ]);
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
      resume: resume?.status === "已送出"
        ? { status: resume.status, collectUrl: "" }
        : {
            status: resume?.status || "未填寫",
            collectUrl: `${(process.env.NEXT_PUBLIC_APP_URL || "https://talent-class-system.vercel.app").replace(/\/$/, "")}/teacher-resume/${encodeURIComponent(signTeacherResumeToken(teacher.id))}`,
          },
    });
  } catch (error) {
    // 這支是公開端點，錯誤原文會直接顯示在老師畫面上。
    // 只有「連結失效」這類對方能自行處理的訊息可以照實回；其餘（DB、Blob 設定等）
    // 一律回制式訊息、細節只進 server log，免得把平台錯誤字串與環境變數名稱
    // 送給任何拿到連結的人。POST 已經這樣處理，GET 補齊。
    const dead = error instanceof LinkDeadError;
    if (!dead) console.error("teacher document page load failed", (error as Error).message);
    return NextResponse.json(
      { error: dead ? (error as Error).message : "系統忙碌中，請稍後再試或聯繫行政" },
      { status: dead ? 403 : 500 },
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
    if (previousFileUrl) await deleteSensitiveDocumentOrQueue(previousFileUrl, "teacher_public_reupload");
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
    if (!dead) console.error("teacher document upload failed", (error as Error).message);
    return NextResponse.json(
      { error: dead ? (error as Error).message : "檔案上傳失敗，請稍後再試或聯繫行政" },
      { status: dead ? 403 : 500 },
    );
  }
}
