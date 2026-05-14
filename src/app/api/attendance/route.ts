import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createAttendancesForUniqueDays, parseAttendanceDay } from "@/lib/attendanceBatch";
import { normalizeCategory } from "@/lib/courseMeta";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const year = searchParams.get("year");
  const month = searchParams.get("month");

  const dept = searchParams.get("dept") ?? "";

  const where: Record<string, unknown> = {};
  if (year && month) {
    const start = new Date(Number(year), Number(month) - 1, 1);
    const end = new Date(Number(year), Number(month), 1);
    where.date = { gte: start, lt: end };
  }
  if (dept) where.course = { department: dept };

  const records = await prisma.attendance.findMany({
    where,
    include: { course: true, actualTeacher: true },
    orderBy: { date: "desc" },
  });
  return NextResponse.json(records);
}

function buildFields(data: Record<string, unknown>) {
  return {
    courseId: Number(data.courseId),
    actualTeacherId: Number(data.actualTeacherId),
    studentCount: data.studentCount === "" || data.studentCount === undefined ? null : Number(data.studentCount),
    cancelled: Boolean(data.cancelled),
    cancelReason: (data.cancelReason as string) ?? "",
    makeupDate: data.makeupDate ? parseAttendanceDay(String(data.makeupDate).slice(0, 10)) : null,
    makeupDone: Boolean(data.makeupDone),
    category: normalizeCategory(data.category as string),
    hours: Number(data.hours) || 1,
    notes: (data.notes as string) ?? "",
  };
}

export async function POST(req: NextRequest) {
  const data = (await req.json()) as Record<string, unknown>;

  const dates: string[] = Array.isArray(data.dates) && (data.dates as unknown[]).length > 0
    ? (data.dates as string[])
    : data.date
      ? [String(data.date).slice(0, 10)]
      : [];

  if (dates.length === 0) {
    return NextResponse.json({ error: "請提供 date 或 dates" }, { status: 400 });
  }

  const fields = buildFields(data);

  if (dates.length === 1) {
    const record = await prisma.attendance.create({
      data: { ...fields, date: parseAttendanceDay(dates[0]) },
      include: { course: true, actualTeacher: true },
    });
    return NextResponse.json(record, { status: 201 });
  }

  const { created, skipped, records } = await createAttendancesForUniqueDays(dates, fields);
  return NextResponse.json({ created, skipped, records }, { status: 201 });
}
