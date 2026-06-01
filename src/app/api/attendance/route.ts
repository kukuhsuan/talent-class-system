import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createAttendancesForUniqueDays, parseAttendanceDay } from "@/lib/attendanceBatch";
import { normalizeCategory } from "@/lib/courseMeta";
import { taipeiDateIso, utcStartOfNextIsoDay } from "@/lib/courseDates";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const year = searchParams.get("year");
  const month = searchParams.get("month");
  const page = Math.max(1, Number(searchParams.get("page") ?? "0") || 0);
  const pageSizeRaw = Number(searchParams.get("pageSize") ?? "0") || 0;
  const pageSize = pageSizeRaw ? Math.min(50, Math.max(20, pageSizeRaw)) : 0;

  const dept = searchParams.get("dept") ?? "";
  const school = searchParams.get("school") ?? "";
  const teacherId = searchParams.get("teacherId") ?? "";
  const date = searchParams.get("date") ?? "";
  const category = searchParams.get("category") ?? "";
  const status = searchParams.get("status") ?? "";

  const where: Record<string, unknown> = {};
  if (year && month) {
    const start = new Date(Number(year), Number(month) - 1, 1);
    const end = new Date(Number(year), Number(month), 1);
    where.date = { gte: start, lt: end };
  }
  const courseFilter: Record<string, unknown> = {};
  if (dept) courseFilter.department = dept;
  if (school) courseFilter.school = school;
  if (category) where.category = normalizeCategory(category);
  if (teacherId) where.actualTeacherId = Number(teacherId);
  if (date) {
    const start = parseAttendanceDay(date.slice(0, 10));
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    where.date = { gte: start, lt: end };
  }

  const tomorrowStart = utcStartOfNextIsoDay(taipeiDateIso());
  const currentDateFilter = (where.date ?? {}) as { gte?: Date; lt?: Date };
  where.date = {
    ...currentDateFilter,
    lt: currentDateFilter.lt && currentDateFilter.lt < tomorrowStart ? currentDateFilter.lt : tomorrowStart,
  };

  if (status === "missing") {
    where.cancelled = false;
    where.studentCount = null;
  } else if (status === "done") {
    where.cancelled = false;
    where.studentCount = { not: null };
  } else if (status === "cancelled") {
    where.cancelled = true;
  }
  if (Object.keys(courseFilter).length) where.course = courseFilter;

  const query = {
    where,
    include: { course: { include: { assistantTeacher: true } }, actualTeacher: true, assistantTeacher: true },
    orderBy: { date: "desc" },
  } as const;
  const [records, total] = await Promise.all([
    prisma.attendance.findMany(pageSize ? { ...query, skip: (page - 1) * pageSize, take: pageSize } : query),
    pageSize ? prisma.attendance.count({ where }) : Promise.resolve(0),
  ]);
  const unique = new Map<string, (typeof records)[number]>();
  for (const record of records) {
    const key = `${record.course.code || record.courseId}|${record.date.toISOString().slice(0, 10)}`;
    if (!unique.has(key)) unique.set(key, record);
  }
  const items = [...unique.values()];
  if (pageSize) return NextResponse.json({ items, total, page, pageSize });
  return NextResponse.json(items);
}

function buildFields(data: Record<string, unknown>) {
  return {
    courseId: Number(data.courseId),
    actualTeacherId: Number(data.actualTeacherId),
    assistantTeacherId: data.assistantTeacherId === "" || data.assistantTeacherId === undefined || data.assistantTeacherId === null ? null : Number(data.assistantTeacherId),
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

  const { created, skipped, records } = await createAttendancesForUniqueDays(dates, fields);
  if (dates.length === 1) {
    return NextResponse.json(
      records[0] ?? { created, skipped, records },
      { status: created > 0 ? 201 : 200 },
    );
  }

  return NextResponse.json({ created, skipped, records }, { status: 201 });
}
