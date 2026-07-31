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
import { putSensitiveDocument, validateSensitiveFile } from "@/lib/sensitiveBlob";
import { writeAuditLog } from "@/lib/auditLog";
import { getAppSetting } from "@/lib/appSetting";

export const runtime = "nodejs";

type Params = { token: string } | Promise<{ token: string }>;

async function teacherFromToken(params: Params) {
  const { token } = await params;
  const { teacherId } = verifyTeacherDocumentToken(decodeURIComponent(token));
  const teacher = await prisma.teacher.findUnique({ where: { id: teacherId }, select: { id: true, name: true } });
  if (!teacher) throw new Error("找不到老師資料");
  return teacher;
}

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
    return NextResponse.json({ error: (error as Error).message || "連結已失效" }, { status: 403 });
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

    const check = validateSensitiveFile(file);
    if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });

    const stored = await putSensitiveDocument({ teacherId: teacher.id, docType, file, ext: check.ext });
    const row = await upsertTeacherDocument({
      teacherId: teacher.id,
      docType,
      fileUrl: stored.pathname,
      fileName: file.name,
      fileSize: file.size,
      contentType: stored.contentType,
      uploadedBy: `老師自傳：${teacher.name}`,
    });
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
    const message = (error as Error).message || "上傳失敗";
    const expired = message.includes("token") || message.includes("Token");
    return NextResponse.json(
      { error: expired ? "連結已失效，請聯繫行政重新產生" : message },
      { status: expired ? 403 : 500 },
    );
  }
}
