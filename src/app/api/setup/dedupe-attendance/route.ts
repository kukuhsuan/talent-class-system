import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function dayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function score(row: {
  id: number;
  studentCount: number | null;
  studentCountA: number | null;
  studentCountB: number | null;
  reportContent: string;
  reportSentAt: Date | null;
  notes: string;
}) {
  return (
    (row.studentCount !== null ? 16 : 0) +
    (row.studentCountA !== null ? 8 : 0) +
    (row.studentCountB !== null ? 8 : 0) +
    (row.reportContent ? 4 : 0) +
    (row.reportSentAt ? 2 : 0) +
    (row.notes ? 1 : 0) +
    row.id / 1_000_000
  );
}

export async function GET() {
  const rows = await prisma.attendance.findMany({
    select: {
      id: true,
      date: true,
      courseId: true,
      course: { select: { code: true, school: true, courseType: true, time: true } },
      studentCount: true,
      studentCountA: true,
      studentCountB: true,
      reportContent: true,
      reportSentAt: true,
      notes: true,
    },
    orderBy: [{ courseId: "asc" }, { date: "asc" }, { id: "asc" }],
  });

  const groups = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = `${row.course.code || row.courseId}|${dayKey(row.date)}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }

  const deleteIds: number[] = [];
  let duplicateGroups = 0;
  for (const grouped of groups.values()) {
    if (grouped.length < 2) continue;
    duplicateGroups++;
    const sorted = [...grouped].sort((a, b) => score(b) - score(a));
    deleteIds.push(...sorted.slice(1).map((row) => row.id));
  }

  for (const id of deleteIds) {
    await prisma.attendance.delete({ where: { id } });
  }

  let uniqueIndex = "ok";
  try {
    await prisma.$executeRawUnsafe(
      "CREATE UNIQUE INDEX IF NOT EXISTS Attendance_courseId_date_key ON Attendance(courseId, date)",
    );
  } catch (e) {
    uniqueIndex = `failed: ${(e as Error).message}`;
  }

  return NextResponse.json({
    ok: true,
    duplicateGroups,
    deleted: deleteIds.length,
    uniqueIndex,
  });
}
