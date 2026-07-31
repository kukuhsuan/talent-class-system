import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { HR_DOCUMENT_ROLES, requireRole, sameOriginOk } from "@/lib/permissions";
import { ensureTeacherExtendedColumns } from "@/lib/teacherColumns";
import { writeAuditLog } from "@/lib/auditLog";

export const runtime = "nodejs";

// 作廢某位老師手上所有的文件上傳連結。
// 連結一旦傳出去就收不回來，外流時唯一的補救就是讓舊權杖失效——
// 改 AUTH_SECRET 會一次打死全站公開連結，所以改用每位老師自己的世代編號。
export async function POST(req: NextRequest) {
  const { user, response } = await requireRole(HR_DOCUMENT_ROLES);
  if (response) return response;
  if (!sameOriginOk(req)) return NextResponse.json({ error: "來源不合法" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const teacherId = Number(body?.teacherId);
  if (!Number.isFinite(teacherId)) return NextResponse.json({ error: "缺少老師 ID" }, { status: 400 });

  await ensureTeacherExtendedColumns();
  const teacher = await prisma.teacher.findUnique({
    where: { id: teacherId },
    select: { id: true, name: true, docLinkEpoch: true },
  });
  if (!teacher) return NextResponse.json({ error: "找不到老師資料" }, { status: 404 });

  const nextEpoch = (teacher.docLinkEpoch ?? 0) + 1;
  await prisma.teacher.update({ where: { id: teacher.id }, data: { docLinkEpoch: nextEpoch } });

  await writeAuditLog(req, {
    action: "update",
    targetType: "TeacherDocument",
    targetId: teacher.id,
    targetLabel: `老師：${teacher.name}`,
    diffSummary: `作廢文件上傳連結：${teacher.name}（第 ${nextEpoch} 代，操作者 ${user?.name || user?.username || ""}）`,
    sensitive: true,
  });

  return NextResponse.json({ ok: true, teacherId: teacher.id, epoch: nextEpoch });
}
