import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { TEACHER_DOCUMENT_FILE_ROLES, requireRole } from "@/lib/permissions";
import { TEACHER_DOC_LABELS, getTeacherDocumentWithUrl } from "@/lib/teacherDocument";
import { documentDownloadName, readSensitiveDocument } from "@/lib/sensitiveBlob";
import { writeAuditLogStrict } from "@/lib/auditLog";

export const runtime = "nodejs";

type Params = { id: string } | Promise<{ id: string }>;

// 存摺／委任書原檔的唯一出口。前端永遠只拿得到這個網址，拿不到 blob 原始路徑。
export async function GET(req: NextRequest, { params }: { params: Params }) {
  const { user, response } = await requireRole(TEACHER_DOCUMENT_FILE_ROLES);
  if (response) return response;

  const { id } = await params;
  const document = await getTeacherDocumentWithUrl(Number(id));
  if (!document) return NextResponse.json({ error: "找不到檔案" }, { status: 404 });
  if (!document.fileUrl) {
    // 到期清除過的檔案：審核紀錄還在，但原檔已依保留政策刪除
    const purged = Boolean(document.filePurgedAt);
    return NextResponse.json(
      { error: purged ? "原檔已依保留期限刪除，僅保留審核紀錄" : "找不到檔案" },
      { status: purged ? 410 : 404 },
    );
  }

  const teacher = await prisma.teacher.findUnique({
    where: { id: document.teacherId },
    select: { name: true },
  });

  // 每一次檢視都留紀錄：誰、什麼時候、看了誰的哪份文件。
  // 這裡刻意用 strict 版：稽核寫不進去就不放行，否則就會出現「看得到但查不到誰看過」的檔案。
  try {
    await writeAuditLogStrict(req, {
      action: "export",
      targetType: "TeacherDocument",
      targetId: document.id,
      targetLabel: `${teacher?.name ?? document.teacherId}－${TEACHER_DOC_LABELS[document.docType]}`,
      diffSummary: `檢視${TEACHER_DOC_LABELS[document.docType]}原檔（${user?.name || user?.username || ""}）`,
      sensitive: true,
    });
  } catch {
    return NextResponse.json({ error: "稽核紀錄寫入失敗，為保護個資暫不提供檔案，請稍後再試" }, { status: 503 });
  }

  try {
    const result = await readSensitiveDocument(document.fileUrl);
    if (!result || !result.stream) return NextResponse.json({ error: "檔案已不存在" }, { status: 404 });
    const filename = documentDownloadName(document.docType, teacher?.name ?? "老師", document.fileName);
    return new NextResponse(result.stream as unknown as BodyInit, {
      headers: {
        "Content-Type": document.contentType || "application/octet-stream",
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(filename)}`,
        // 敏感檔案不要留在任何一層快取
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message || "檔案讀取失敗" }, { status: 500 });
  }
}
