import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { BACKOFFICE_ROLES, requireRole } from "@/lib/permissions";
import { signPublicAccessToken } from "@/lib/publicAccessToken";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { response } = await requireRole(BACKOFFICE_ROLES);
  if (response) return response;

  const { id } = await params;
  const attendanceId = Number(id);
  if (!Number.isInteger(attendanceId) || attendanceId <= 0) {
    return NextResponse.json({ error: "上課紀錄編號不正確" }, { status: 400 });
  }

  const attendance = await prisma.attendance.findUnique({
    where: { id: attendanceId },
    select: { id: true, cancelled: true },
  });
  if (!attendance) return NextResponse.json({ error: "找不到這筆上課紀錄" }, { status: 404 });
  if (attendance.cancelled) return NextResponse.json({ error: "停課紀錄不可產生回報連結" }, { status: 409 });

  const token = signPublicAccessToken("report", attendance.id);
  return NextResponse.json({
    path: `/report/${encodeURIComponent(token)}`,
    origin: new URL(req.url).origin,
  });
}
