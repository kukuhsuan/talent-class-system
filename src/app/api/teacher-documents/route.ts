import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { HR_DOCUMENT_ROLES, requireRole, sameOriginOk } from "@/lib/permissions";
import { listTeacherDocuments } from "@/lib/teacherDocument";
import { signTeacherDocumentToken } from "@/lib/publicAccessToken";
import { writeAuditLog } from "@/lib/auditLog";

export const runtime = "nodejs";

function appUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL || "https://talent-class-system.vercel.app").replace(/\/$/, "");
}

// 只回文件「狀態」，不含 fileUrl。原檔要走 /api/teacher-documents/{id}/file。
export async function GET(req: NextRequest) {
  const { response } = await requireRole(HR_DOCUMENT_ROLES);
  if (response) return response;
  const teacherIdParam = req.nextUrl.searchParams.get("teacherId");
  const teacherIds = teacherIdParam ? [Number(teacherIdParam)] : undefined;
  const documents = await listTeacherDocuments(teacherIds);
  return NextResponse.json(documents);
}

// 產生給老師的免登入上傳連結
export async function POST(req: NextRequest) {
  const { response } = await requireRole(HR_DOCUMENT_ROLES);
  if (response) return response;
  if (!sameOriginOk(req)) return NextResponse.json({ error: "來源不合法" }, { status: 403 });
  const data = await req.json().catch(() => ({}));
  const teacherId = Number(data?.teacherId);
  if (!Number.isFinite(teacherId)) return NextResponse.json({ error: "缺少老師 ID" }, { status: 400 });
  const teacher = await prisma.teacher.findUnique({ where: { id: teacherId }, select: { id: true, name: true } });
  if (!teacher) return NextResponse.json({ error: "找不到老師資料" }, { status: 404 });

  const token = signTeacherDocumentToken(teacher.id);
  await writeAuditLog(req, {
    action: "create",
    targetType: "TeacherDocument",
    targetId: teacher.id,
    targetLabel: `老師：${teacher.name}`,
    diffSummary: `產生文件上傳連結：${teacher.name}`,
    sensitive: true,
  });
  return NextResponse.json({
    teacherId: teacher.id,
    teacherName: teacher.name,
    uploadUrl: `${appUrl()}/teacher-documents/${encodeURIComponent(token)}`,
    expiresInDays: 30,
  });
}
