import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Payload = {
  attendanceIds?: number[];
  locked?: boolean;
  confirm?: boolean;
};

export async function POST(req: NextRequest) {
  const data = (await req.json()) as Payload;
  const attendanceIds = [...new Set((data.attendanceIds ?? []).map(Number).filter(Number.isFinite))];
  const locked = data.locked !== false;

  if (attendanceIds.length === 0) {
    return NextResponse.json({ error: "請提供 attendanceIds" }, { status: 400 });
  }
  if (attendanceIds.length > 1000) {
    return NextResponse.json({ error: "單次最多處理 1000 筆" }, { status: 400 });
  }

  const records = await prisma.attendance.findMany({
    where: { id: { in: attendanceIds } },
    select: {
      id: true,
      date: true,
      hours: true,
      isPayrollLocked: true,
      payrollLockedAt: true,
      actualTeacher: { select: { name: true } },
      course: { select: { code: true, school: true } },
    },
    orderBy: { date: "asc" },
  });

  const changes = records.filter((record) => record.isPayrollLocked !== locked);
  if (data.confirm !== true) {
    return NextResponse.json({
      dryRun: true,
      requested: attendanceIds.length,
      found: records.length,
      wouldChange: changes.length,
      targetLocked: locked,
      items: changes,
      note: "未提供 confirm=true，不會修改資料。",
    });
  }

  const result = await prisma.attendance.updateMany({
    where: { id: { in: changes.map((record) => record.id) } },
    data: {
      isPayrollLocked: locked,
      payrollLockedAt: locked ? new Date() : null,
    },
  });

  return NextResponse.json({ ok: true, updated: result.count, targetLocked: locked });
}
