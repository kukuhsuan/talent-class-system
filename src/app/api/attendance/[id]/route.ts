import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseAttendanceDay } from "@/lib/attendanceBatch";
import { normalizeCategory } from "@/lib/courseMeta";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await req.json();
  const { makeupDate, assistantTeacherId, ...rest } = data;
  const record = await prisma.attendance.update({
    where: { id: Number(id) },
    data: {
      ...rest,
      assistantTeacherId: assistantTeacherId === "" || assistantTeacherId === undefined || assistantTeacherId === null ? null : Number(assistantTeacherId),
      date: data.date ? parseAttendanceDay(String(data.date).slice(0, 10)) : undefined,
      category: rest.category ? normalizeCategory(rest.category) : undefined,
      makeupDate: makeupDate ? parseAttendanceDay(String(makeupDate).slice(0, 10)) : null,
    },
    include: { course: { include: { assistantTeacher: true } }, actualTeacher: true, assistantTeacher: true },
  });
  return NextResponse.json(record);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await prisma.attendance.delete({ where: { id: Number(id) } });
  return NextResponse.json({ ok: true });
}
