import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createAttendancesForUniqueDays, parseAttendanceDay } from "@/lib/attendanceBatch";
import { effectiveAttendanceTime, stampAttendanceTime, usableScheduledTime } from "@/lib/attendanceTime";
import { normalizeCategory } from "@/lib/courseMeta";
import { taipeiDateIso, utcStartOfIsoDay, utcStartOfNextIsoDay } from "@/lib/courseDates";
import { attendanceReportWindow, outstandingReportItems, reportOverdueDays } from "@/lib/reportWindow";
import { coursePayrollHoursForAttendance } from "@/lib/payrollHours";
import { resolvePayrollHours } from "@/lib/payrollHoursCore";
import { attendanceHoursOverrideMap, setAttendanceHoursOverrideMany } from "@/lib/attendanceHoursOverride";
import { ensureAttendanceEquipmentTable, parseEquipmentInput, saveAttendanceEquipment } from "@/lib/equipmentReminder";
import { expectedStudentCountMap, parseExpectedStudentCount, setExpectedStudentCount } from "@/lib/expectedStudentCount";
import { writeAuditLog } from "@/lib/auditLog";
import { schoolSignatureMap } from "@/lib/schoolSignature";
import { WAITING_TEACHER_NAME } from "@/lib/teacherAssignment";

// 待回報清單往回看幾天：要和首頁 /api/dashboard 的 PENDING_REPORT_LOOKBACK_DAYS 一致，
// 不然首頁的數字和點進來看到的筆數會對不起來。
const MISSING_REPORT_LOOKBACK_DAYS = 30;
// 待指派老師的時間視窗，要和 /api/dashboard 的 PENDING_SUBSTITUTE_AHEAD_DAYS 一致
const UNASSIGNED_LOOKBACK_DAYS = 30;
const UNASSIGNED_AHEAD_DAYS = 14;

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
    // 往回看 30 天，和首頁待回報清單同一個視窗。原本只看 2 天，
    // 首頁說「還有 N 筆」點進來卻少一半——而且漏回報的課第 4 天起就再也找不到了。
    const lookbackStart = utcStartOfIsoDay(todayIso);
    lookbackStart.setUTCDate(lookbackStart.getUTCDate() - MISSING_REPORT_LOOKBACK_DAYS);
    const dateFilter = (where.date ?? {}) as { gte?: Date; lt?: Date };
    where.date = {
      ...dateFilter,
      gte: dateFilter.gte && dateFilter.gte > lookbackStart ? dateFilter.gte : lookbackStart,
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
  } else if (status === "unassigned") {
    // 待指派老師／待指派代課：課還掛在「待排老師」佔位帳號上，代表沒有人會去上這堂課。
    // 原本這個分頁只在前端過濾當月已載入的那一頁，跨月的漏網之魚看不到；
    // 首頁的紅字計數就是點進來這裡，兩邊要用同一個時間視窗才對得起來。
    where.cancelled = false;
    where.OR = [
      { actualTeacher: { name: WAITING_TEACHER_NAME } },
      { assistantTeacher: { name: WAITING_TEACHER_NAME } },
    ];
    const todayIso = taipeiDateIso();
    const windowStart = utcStartOfIsoDay(todayIso);
    windowStart.setUTCDate(windowStart.getUTCDate() - UNASSIGNED_LOOKBACK_DAYS);
    const windowEnd = utcStartOfIsoDay(todayIso);
    windowEnd.setUTCDate(windowEnd.getUTCDate() + UNASSIGNED_AHEAD_DAYS);
    const dateFilter = (where.date ?? {}) as { gte?: Date; lt?: Date };
    where.date = {
      gte: dateFilter.gte && dateFilter.gte > windowStart ? dateFilter.gte : windowStart,
      lt: dateFilter.lt && dateFilter.lt < windowEnd ? dateFilter.lt : windowEnd,
    };
  }
  if (Object.keys(courseFilter).length) where.course = courseFilter;

  const query = {
    where: where as Prisma.AttendanceWhereInput,
    // 列表用不到的大欄位不回傳（回報詳情、AI 摘要、事件紀錄等），減少 Turso 傳輸與 JSON 體積
    omit: {
      skillFocus: true,
      classStatus: true,
      incident: true,
      incidentChild: true,
      incidentProcess: true,
      incidentAction: true,
      incidentNotified: true,
      reportPhotos: true,
      aiSummary: true,
      aiSkillFocus: true,
      aiTeachingNote: true,
      schoolNotifyStatus: true,
      schoolNotifyError: true,
      schoolNotifiedAt: true,
      scheduledSchoolId: true,
      scheduledSchoolName: true,
      scheduledAddress: true,
      scheduledLocation: true,
      payrollLockedAt: true,
      createdAt: true,
    },
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
  const [expectedMap, signatures, hoursOverrideMap] = await Promise.all([
    expectedStudentCountMap(records.map((record) => record.id)),
    schoolSignatureMap(records.map((record) => record.id)),
    // 出勤列表顯示的時數必須和薪資算出來的一致，否則行政又會看到「畫面一個數字、薪資另一個」
    attendanceHoursOverrideMap(records.map((record) => record.id)),
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
    const payrollHours = resolvePayrollHours(
      record.hours,
      record.course.payrollHours,
      scheduledTime,
      hoursOverrideMap.get(record.id) === true,
    );
    const reportWindow = attendanceReportWindow({ ...record, hours: payrollHours.payableHours }, scheduledTime);
    // 逾期未回報的課也要留在「待回報」分頁：48 小時只是老師自己能不能補，
    // 行政要追的帳不會因為過期就消失（首頁待回報清單同一套判斷）。
    const missingItems = outstandingReportItems({ ...record, hours: payrollHours.payableHours }, scheduledTime);
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
      reportEnded: reportWindow.ended,
      reportFillStatus: reportWindow.status,
      reportExpiresAt: reportWindow.expiresAt.toISOString(),
      missingItems,
      pendingReport: missingItems.length > 0,
      overdueDays: reportOverdueDays({ ...record, hours: payrollHours.payableHours }, scheduledTime),
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
  // 行政在新增排課時就特地填了和課程預設不同的時數，和事後在出勤頁改是同一件事，
  // 一樣要標記成人工覆蓋，否則薪資會靜默地照課程預設算（見 lib/attendanceHoursOverride.ts）
  const createdWithOverride = fields.hours > 0 && fields.hours !== calculatedHours.hours;
  if (!fields.hours || fields.hours <= 0) fields.hours = calculatedHours.hours;
  if (calculatedHours.needsReview && !fields.notes.includes("上課時間需人工確認")) {
    fields.notes = [fields.notes, `上課時間需人工確認：${calculatedHours.reason}`].filter(Boolean).join("；");
  }

  const { created, skipped, records } = await createAttendancesForUniqueDays(dates, fields);
  if (created > 0) {
    await stampAttendanceTime(fields.courseId, dates, course?.time ?? "");
    if (createdWithOverride) {
      await setAttendanceHoursOverrideMany(records.map((record) => record.id), true);
    }
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
