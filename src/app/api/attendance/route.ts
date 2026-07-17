import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createAttendancesForUniqueDays, parseAttendanceDay } from "@/lib/attendanceBatch";
import { effectiveAttendanceTime, stampAttendanceTime, usableScheduledTime } from "@/lib/attendanceTime";
import { normalizeCategory } from "@/lib/courseMeta";
import { taipeiDateIso, utcStartOfIsoDay, utcStartOfNextIsoDay } from "@/lib/courseDates";
import { attendanceMissingItems, attendanceReportWindow, isPendingReport } from "@/lib/reportWindow";
import { coursePayrollHoursForAttendance } from "@/lib/payrollHours";
import { resolvePayrollHours } from "@/lib/payrollHoursCore";
import { ensureAttendanceEquipmentTable, parseEquipmentInput, saveAttendanceEquipment } from "@/lib/equipmentReminder";
import { expectedStudentCountMap, parseExpectedStudentCount, setExpectedStudentCount } from "@/lib/expectedStudentCount";
import { writeAuditLog } from "@/lib/auditLog";
import { schoolSignatureMap } from "@/lib/schoolSignature";

export async function GET(req: NextRequest) {
  await ensureAttendanceEquipmentTable();
  const { searchParams } = new URL(req.url);
  const year = searchParams.get("year");
  const month = searchParams.get("month");
  const page = Math.max(1, Number(searchParams.get("page") ?? "0") || 0);
  const pageSizeRaw = Number(searchParams.get("pageSize") ?? "0") || 0;
  const pageSize = pageSizeRaw ? Math.min(500, Math.max(20, pageSizeRaw)) : 0;

  const dept = searchParams.get("dept") ?? "";
  const school = searchParams.get("school") ?? "";
  const teacherId = searchParams.get("teacherId") ?? "";
  const date = searchParams.get("date") ?? "";
  const category = searchParams.get("category") ?? "";
  const status = searchParams.get("status") ?? "";

  const where: Record<string, unknown> = {};
  if (year && month) {
    const start = new Date(Date.UTC(Number(year), Number(month) - 1, 1));
    const end = new Date(Date.UTC(Number(year), Number(month), 1));
    where.date = { gte: start, lt: end };
  }
  const courseFilter: Record<string, unknown> = {};
  if (dept) courseFilter.department = dept;
  if (school) courseFilter.school = school;
  const normalizedCategory = category ? normalizeCategory(category) : "";
  if (normalizedCategory) where.category = normalizedCategory;
  if (teacherId) where.actualTeacherId = Number(teacherId);
  if (date) {
    const start = parseAttendanceDay(date.slice(0, 10));
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    where.date = { gte: start, lt: end };
  }

  if (status === "missing") {
    where.cancelled = false;
    const todayIso = taipeiDateIso();
    const tomorrowStart = utcStartOfNextIsoDay(todayIso);
    const twoDaysAgo = utcStartOfIsoDay(todayIso);
    twoDaysAgo.setUTCDate(twoDaysAgo.getUTCDate() - 2);
    const dateFilter = (where.date ?? {}) as { gte?: Date; lt?: Date };
    where.date = {
      ...dateFilter,
      gte: dateFilter.gte && dateFilter.gte > twoDaysAgo ? dateFilter.gte : twoDaysAgo,
      lt: dateFilter.lt && dateFilter.lt < tomorrowStart ? dateFilter.lt : tomorrowStart,
    };
    const missingProgress = { reportContent: "" };
    if (normalizedCategory === "課內") {
      where.OR = [missingProgress];
    } else {
      const missingCount = {
        ...(normalizedCategory ? {} : { category: { not: "課內" } }),
        studentCount: null,
        studentCountA: null,
        studentCountB: null,
      };
      where.OR = [missingCount, missingProgress];
    }
  } else if (status === "done") {
    where.cancelled = false;
    where.OR = [
      { studentCount: { not: null } },
      { studentCountA: { not: null } },
      { studentCountB: { not: null } },
      { category: "課內", reportContent: { not: "" } },
    ];
  } else if (status === "cancelled") {
    where.cancelled = true;
  }
  if (Object.keys(courseFilter).length) where.course = courseFilter;

  const query = {
    where: where as Prisma.AttendanceWhereInput,
    include: {
      course: {
        select: {
          id: true,
          code: true,
          school: true,
          courseType: true,
          department: true,
          time: true,
          payrollHours: true,
          teacherId: true,
          assistantTeacherId: true,
          category: true,
          assistantTeacher: { select: { id: true, name: true } },
        },
      },
      actualTeacher: { select: { id: true, name: true, lineUserId: true, lineRegion: true } },
      assistantTeacher: { select: { id: true, name: true, lineUserId: true, lineRegion: true } },
      substitutes: { select: { role: true } },
      equipment: true,
    },
    orderBy: [
      { course: { school: "asc" as const } },
      { date: "asc" as const },
      { id: "asc" as const },
    ],
  } satisfies Prisma.AttendanceFindManyArgs;
  const paginateInDatabase = pageSize > 0 && status !== "missing";
  const [records, databaseTotal] = await Promise.all([
    prisma.attendance.findMany({ ...query, ...(paginateInDatabase ? { skip: (page - 1) * pageSize, take: pageSize } : {}) }),
    paginateInDatabase ? prisma.attendance.count({ where: where as Prisma.AttendanceWhereInput }) : Promise.resolve(0),
  ]);
  // scheduledTime / payrollHours 已在 schema 內，直接由 findMany 取得，省 2 次資料庫來回
  const [expectedMap, signatures] = await Promise.all([
    expectedStudentCountMap(records.map((record) => record.id)),
    schoolSignatureMap(records.map((record) => record.id)),
  ]);
  const annotatedRecords = records.map((record) => {
    const scheduledTime = effectiveAttendanceTime({
      scheduledTime: usableScheduledTime(record.scheduledTime),
      courseTime: record.course.time,
      attendanceHours: record.hours,
      isPayrollLocked: record.isPayrollLocked,
      reportContent: record.reportContent,
      reportSentAt: record.reportSentAt,
      studentCount: record.studentCount,
      studentCountA: record.studentCountA,
      studentCountB: record.studentCountB,
    });
    const payrollHours = resolvePayrollHours(record.hours, record.course.payrollHours, scheduledTime);
    const reportWindow = attendanceReportWindow({ ...record, hours: payrollHours.payableHours }, scheduledTime);
    const missingItems = attendanceMissingItems({ ...record, hours: payrollHours.payableHours }, scheduledTime);
    return {
      ...record,
      scheduledTime,
      expectedStudentCount: expectedMap.get(record.id) ?? null,
      schoolVerifierName: signatures.get(record.id)?.schoolVerifierName ?? "",
      schoolSignatureData: signatures.get(record.id)?.schoolSignatureData ?? "",
      schoolSignedAt: signatures.get(record.id)?.schoolSignedAt ?? null,
      course: { ...record.course, payrollHours: record.course.payrollHours ?? null },
      hours: payrollHours.payableHours,
      hoursNeedsReview: payrollHours.needsReview,
      hoursReviewReason: payrollHours.reason,
      reportFillable: reportWindow.fillable,
      reportExpired: reportWindow.expired,
      reportFillStatus: reportWindow.status,
      reportExpiresAt: reportWindow.expiresAt.toISOString(),
      missingItems,
      pendingReport: isPendingReport({ ...record, hours: payrollHours.payableHours }, scheduledTime),
    };
  });
  const unique = new Map<string, (typeof annotatedRecords)[number]>();
  for (const record of annotatedRecords) {
    const key = `${record.course.code || record.courseId}|${record.date.toISOString().slice(0, 10)}`;
    if (!unique.has(key)) unique.set(key, record);
  }
  const allItems = [...unique.values()].filter((record) => status !== "missing" || record.pendingReport);
  const total = status === "missing" ? allItems.length : databaseTotal;
  const items = pageSize && status === "missing"
    ? allItems.slice((page - 1) * pageSize, page * pageSize)
    : allItems;
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
    hours: Number.isFinite(Number(data.hours)) ? Number(data.hours) : 0,
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
  const course = await prisma.course.findUnique({ where: { id: fields.courseId }, select: { id: true, time: true, payrollHours: true } });
  const calculatedHours = coursePayrollHoursForAttendance(course?.payrollHours, course?.time ?? "");
  if (!fields.hours || fields.hours <= 0) fields.hours = calculatedHours.hours;
  if (calculatedHours.needsReview && !fields.notes.includes("上課時間需人工確認")) {
    fields.notes = [fields.notes, `上課時間需人工確認：${calculatedHours.reason}`].filter(Boolean).join("；");
  }

  const { created, skipped, records } = await createAttendancesForUniqueDays(dates, fields);
  if (created > 0) {
    await stampAttendanceTime(fields.courseId, dates, course?.time ?? "");
  }
  // 預計人數（行政先填，課前提醒顯示）
  const expectedCount = parseExpectedStudentCount(data.expectedStudentCount);
  if (expectedCount !== undefined) {
    await setExpectedStudentCount(records.map((record) => record.id), expectedCount);
  }
  // 器材提醒設定（第一堂/組裝/課後轉送）
  const equipmentInput = parseEquipmentInput(data.equipment);
  if (equipmentInput) {
    for (const record of records) {
      await saveAttendanceEquipment(record.id, equipmentInput);
    }
  }
  await writeAuditLog(req, {
    action: "create",
    targetType: "Attendance",
    targetId: records.map((record) => record.id).join(","),
    targetLabel: dates.length === 1 ? dates[0] : `${dates.length} 筆出勤`,
    afterData: records,
    diffSummary: dates.length === 1 ? `新增出勤紀錄：${dates[0]}` : `新增 ${created} 筆出勤紀錄`,
  });
  if (dates.length === 1) {
    return NextResponse.json(
      records[0] ?? { created, skipped, records },
      { status: created > 0 ? 201 : 200 },
    );
  }

  return NextResponse.json({ created, skipped, records }, { status: 201 });
}
