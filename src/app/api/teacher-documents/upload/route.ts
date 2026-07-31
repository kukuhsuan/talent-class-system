import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { HR_DOCUMENT_ROLES, requireRole, sameOriginOk } from "@/lib/permissions";
import { isTeacherDocType, upsertTeacherDocument, TEACHER_DOC_LABELS } from "@/lib/teacherDocument";
import { deleteSensitiveDocument, putSensitiveDocument, validateSensitiveFile } from "@/lib/sensitiveBlob";
import { writeAuditLog } from "@/lib/auditLog";

export const runtime = "nodejs";

// 行政代傳版（老師把檔案用 LINE 傳給行政的情況）。老師自傳走 /api/teacher-documents/public/[token]。
export async function POST(req: NextRequest) {
  const { user, response } = await requireRole(HR_DOCUMENT_ROLES);
  if (response) return response;
  if (!sameOriginOk(req)) return NextResponse.json({ error: "來源不合法" }, { status: 403 });

  const form = await req.formData();
  const teacherId = Number(form.get("teacherId"));
  const docType = String(form.get("docType") ?? "");
  const file = form.get("file");

  if (!Number.isFinite(teacherId)) return NextResponse.json({ error: "缺少老師 ID" }, { status: 400 });
  if (!isTeacherDocType(docType)) return NextResponse.json({ error: "文件類型不正確" }, { status: 400 });
  if (!(file instanceof File)) return NextResponse.json({ error: "請選擇檔案" }, { status: 400 });

  const check = await validateSensitiveFile(file);
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });

  const teacher = await prisma.teacher.findUnique({ where: { id: teacherId }, select: { id: true, name: true } });
  if (!teacher) return NextResponse.json({ error: "找不到老師資料" }, { status: 404 });

  try {
    const stored = await putSensitiveDocument({ teacherId, docType, file, ext: check.ext });
    const { row, previousFileUrl } = await upsertTeacherDocument({
      teacherId,
      docType,
      fileUrl: stored.pathname,
      fileName: file.name,
      fileSize: file.size,
      contentType: stored.contentType,
      uploadedBy: `行政代傳：${user?.name || user?.username || ""}`,
    });
    // 被蓋掉的舊檔要真的刪掉，不然 blob 裡會留下沒有任何紀錄指向的存摺
    if (previousFileUrl) await deleteSensitiveDocument(previousFileUrl);
    await writeAuditLog(req, {
      action: "create",
      targetType: "TeacherDocument",
      targetId: row?.id ?? teacherId,
      targetLabel: `${teacher.name}－${TEACHER_DOC_LABELS[docType]}`,
      diffSummary: `行政代傳${TEACHER_DOC_LABELS[docType]}：${teacher.name}`,
      sensitive: true,
    });
    return NextResponse.json(row);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message || "檔案上傳失敗" }, { status: 500 });
  }
}
