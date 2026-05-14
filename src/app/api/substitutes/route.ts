import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const [manualRecords, attendanceRecords] = await Promise.all([
    prisma.substitute.findMany({
      include: { originalTeacher: true, substituteTeacher: true },
      orderBy: { date: "desc" },
    }),
    prisma.attendance.findMany({
      where: { cancelled: false },
      include: { course: { include: { teacher: true } }, actualTeacher: true },
      orderBy: { date: "desc" },
    }),
  ]);

  const manualKeys = new Set(manualRecords.map((r) => [
    r.date.toISOString().slice(0, 10),
    r.school,
    r.courseType,
    r.originalTeacherId,
    r.substituteTeacherId ?? "",
  ].join("|")));

  const linkedRecords = attendanceRecords
    .filter((r) => r.actualTeacherId !== r.course.teacherId)
    .map((r) => ({
      id: `attendance-${r.id}`,
      attendanceId: r.id,
      source: "attendance",
      date: r.date,
      school: r.course.school,
      courseType: r.course.courseType,
      originalTeacher: r.course.teacher,
      substituteTeacher: r.actualTeacher,
      confirmed: r.reportSentAt != null,
      fee: null,
      notes: r.notes || "由出勤紀錄自動帶入",
      time: r.course.time,
      address: r.course.address,
    }))
    .filter((r) => !manualKeys.has([
      r.date.toISOString().slice(0, 10),
      r.school,
      r.courseType,
      r.originalTeacher.id,
      r.substituteTeacher.id,
    ].join("|")));

  return NextResponse.json([
    ...linkedRecords,
    ...manualRecords.map((r) => ({ ...r, source: "manual" })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
}

export async function POST(req: NextRequest) {
  const data = await req.json();
  const record = await prisma.substitute.create({
    data: { ...data, date: new Date(data.date) },
    include: { originalTeacher: true, substituteTeacher: true },
  });
  return NextResponse.json(record, { status: 201 });
}
