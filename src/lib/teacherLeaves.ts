import { prisma } from "@/lib/prisma";
import { attendanceScheduledTimeMap, effectiveAttendanceTime } from "@/lib/attendanceTime";
import { courseLabel } from "@/lib/courseMeta";
import { teacherTeachingProfiles } from "@/lib/teacherTeachingProfile";

export const LEAVE_STATUS = {
  pending: "待審核",
  approved: "已核准，待找代課",
  searching: "尋找代課中",
  found: "已找到代課",
  rejected: "已駁回",
  cancelled: "已取消",
} as const;

export const INQUIRY_STATUS = {
  pending: "pending",
  available: "available",
  unavailable: "unavailable",
  cancelled: "cancelled",
  expired: "expired",
  noLongerNeeded: "noLongerNeeded",
} as const;

export type LeaveRole = "主教" | "助教";

export type LeaveCourseChoice = {
  attendanceId: number;
  teacherId: number;
  role: LeaveRole;
  date: string;
  time: string;
  school: string;
  courseType: string;
};

export type LeaveCancelChoice = {
  id: number;
  attendanceId: number;
  status: string;
  date: string;
  time: string;
  school: string;
  courseType: string;
  role: LeaveRole;
};

export type TeacherLeaveListItem = {
  id: number;
  teacherId: number;
  teacherName: string;
  attendanceId: number;
  courseId: number;
  role: LeaveRole;
  leaveDate: string;
  startTime: string;
  endTime: string;
  time: string;
  school: string;
  courseType: string;
  address: string;
  reason: string;
  notes: string;
  status: string;
  semesterLeaveCountAtSubmit: number;
  reviewedBy: string;
  reviewedAt: string | null;
  rejectedReason: string;
  createdAt: string;
  isPayrollLocked: boolean;
  isReported: boolean;
  inquiries: Array<{
    id: number;
    candidateTeacherId: number;
    candidateTeacherName: string;
    candidateLineUserId: string | null;
    candidateLineRegion: string;
    primaryRegionLabel?: string;
    primarySpecialtyLabel?: string;
    recentAttendanceCount?: number;
    primaryCourseTypes?: string[];
    status: string;
    sentAt: string | null;
    respondedAt: string | null;
  }>;
};

export type TeacherLeaveListOptions = {
  year?: number;
  month?: number;
  status?: string;
  includeDeleted?: boolean;
};

type RawLeaveRow = {
  id: number;
  teacherId: number;
  teacherName: string;
  attendanceId: number;
  courseId: number;
  role: LeaveRole;
  leaveDate: string | Date;
  startTime: string;
  endTime: string;
  school: string;
  courseType: string;
  address: string;
  reason: string;
  notes: string;
  status: string;
  semesterLeaveCountAtSubmit: number;
  reviewedBy: string;
  reviewedAt: string | Date | null;
  rejectedReason: string;
  createdAt: string | Date;
  isPayrollLocked: boolean | number;
  studentCount: number | null;
  studentCountA: number | null;
  studentCountB: number | null;
  reportContent: string | null;
};

type RawInquiryRow = {
  id: number;
  leaveRequestId: number;
  candidateTeacherId: number;
  candidateTeacherName: string;
  candidateLineUserId: string | null;
  candidateLineRegion: string | null;
  status: string;
  sentAt: string | Date | null;
  respondedAt: string | Date | null;
};

const TABLE_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS "TeacherLeaveRequest" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "teacherId" INTEGER NOT NULL,
    "attendanceId" INTEGER NOT NULL,
    "courseId" INTEGER NOT NULL,
    "role" TEXT NOT NULL DEFAULT '主教',
    "leaveDate" DATETIME NOT NULL,
    "startTime" TEXT NOT NULL DEFAULT '',
    "endTime" TEXT NOT NULL DEFAULT '',
    "reason" TEXT NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT '待審核',
    "semesterLeaveCountAtSubmit" INTEGER NOT NULL DEFAULT 0,
    "reviewedBy" TEXT NOT NULL DEFAULT '',
    "reviewedAt" DATETIME,
    "rejectedReason" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  'CREATE INDEX IF NOT EXISTS "TeacherLeaveRequest_teacherId_leaveDate_idx" ON "TeacherLeaveRequest"("teacherId", "leaveDate")',
  'CREATE INDEX IF NOT EXISTS "TeacherLeaveRequest_attendanceId_idx" ON "TeacherLeaveRequest"("attendanceId")',
  'CREATE INDEX IF NOT EXISTS "TeacherLeaveRequest_status_idx" ON "TeacherLeaveRequest"("status")',
  `CREATE TABLE IF NOT EXISTS "SubstituteInquiry" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "leaveRequestId" INTEGER NOT NULL,
    "attendanceId" INTEGER NOT NULL,
    "candidateTeacherId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "sentAt" DATETIME,
    "respondedAt" DATETIME,
    "lineMessageId" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  'CREATE UNIQUE INDEX IF NOT EXISTS "SubstituteInquiry_leaveRequestId_candidateTeacherId_key" ON "SubstituteInquiry"("leaveRequestId", "candidateTeacherId")',
  'CREATE INDEX IF NOT EXISTS "SubstituteInquiry_attendanceId_idx" ON "SubstituteInquiry"("attendanceId")',
  'CREATE INDEX IF NOT EXISTS "SubstituteInquiry_candidateTeacherId_idx" ON "SubstituteInquiry"("candidateTeacherId")',
  'CREATE INDEX IF NOT EXISTS "SubstituteInquiry_status_idx" ON "SubstituteInquiry"("status")',
];

let teacherLeaveTablesReady = false;

export async function ensureTeacherLeaveTables() {
  if (teacherLeaveTablesReady) return;
  for (const sql of TABLE_STATEMENTS) {
    await prisma.$executeRawUnsafe(sql).catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      if (!/already exists|duplicate column/i.test(message)) throw error;
    });
  }
  teacherLeaveTablesReady = true;
}

// 依當下日期計算目前學期範圍：下學期 2/1–8/1、上學期 8/1–隔年 2/1
export function fixedSemesterRange(now: Date = new Date()) {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1; // 1-12
  if (month >= 2 && month < 8) {
    return {
      start: new Date(Date.UTC(year, 1, 1)),
      end: new Date(Date.UTC(year, 7, 1)),
    };
  }
  if (month >= 8) {
    return {
      start: new Date(Date.UTC(year, 7, 1)),
      end: new Date(Date.UTC(year + 1, 1, 1)),
    };
  }
  // 1 月屬於前一年 8 月起的上學期
  return {
    start: new Date(Date.UTC(year - 1, 7, 1)),
    end: new Date(Date.UTC(year, 1, 1)),
  };
}

export function splitTimeRange(time: string) {
  const times = [...time.matchAll(/\d{1,2}:\d{2}/g)].map((match) => match[0]);
  return { startTime: times[0] ?? time.trim(), endTime: times[times.length - 1] ?? "" };
}

function toIsoDate(value: string | Date) {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}

function toIsoStringOrNull(value: string | Date | null) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

export async function semesterLeaveCount(teacherId: number) {
  await ensureTeacherLeaveTables();
  const { start, end } = fixedSemesterRange();
  const rows = await prisma.$queryRawUnsafe<Array<{ count: number }>>(
    `SELECT COUNT(*) AS count
     FROM "TeacherLeaveRequest"
     WHERE "teacherId" = ?
       AND "leaveDate" >= ?
       AND "leaveDate" < ?
       AND "status" NOT IN ('${LEAVE_STATUS.cancelled}', '${LEAVE_STATUS.rejected}')`,
    teacherId,
    start,
    end,
  );
  return Number(rows[0]?.count ?? 0);
}

export async function upcomingLeaveCourseChoices(teacherId: number, limit = 25) {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  // 範圍涵蓋本月與下個月（例如 7 月時可申請 7-8 月的課程）
  const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 2, 1));
  const rows = await prisma.attendance.findMany({
    where: {
      cancelled: false,
      date: { gte: today, lt: end },
      OR: [{ actualTeacherId: teacherId }, { assistantTeacherId: teacherId }],
      course: { isActive: true },
    },
    include: { course: true },
    orderBy: [{ date: "asc" }, { id: "asc" }],
    take: limit,
  });
  const timeMap = await attendanceScheduledTimeMap(rows.map((row) => row.id));
  return rows.map((row) => ({
    attendanceId: row.id,
    teacherId,
    role: row.actualTeacherId === teacherId ? "主教" as const : "助教" as const,
    date: row.date.toISOString().slice(0, 10),
    time: effectiveAttendanceTime({
      scheduledTime: timeMap.get(row.id),
      courseTime: row.course.time,
      attendanceHours: row.hours,
      isPayrollLocked: row.isPayrollLocked,
      reportContent: row.reportContent,
      reportSentAt: row.reportSentAt,
      studentCount: row.studentCount,
      studentCountA: row.studentCountA,
      studentCountB: row.studentCountB,
    }),
    school: row.course.school,
    courseType: courseLabel(row.course.courseType),
  }));
}

export async function createLeaveRequestFromAttendance(input: {
  attendanceId: number;
  teacherId: number;
  reason: string;
  notes?: string;
}) {
  await ensureTeacherLeaveTables();
  const attendance = await prisma.attendance.findUnique({
    where: { id: input.attendanceId },
    include: { course: true },
  });
  if (!attendance) throw new Error("找不到要請假的課程");
  if (attendance.actualTeacherId !== input.teacherId && attendance.assistantTeacherId !== input.teacherId) {
    throw new Error("這堂課不是您的課程，無法申請請假");
  }
  if (attendance.isPayrollLocked) throw new Error("此課程已鎖定薪資，無法申請更換老師");

  const reason = input.reason.trim();
  if (!reason) throw new Error("請假原因必填");

  const timeMap = await attendanceScheduledTimeMap([attendance.id]);
  const time = effectiveAttendanceTime({
    scheduledTime: timeMap.get(attendance.id),
    courseTime: attendance.course.time,
    attendanceHours: attendance.hours,
    isPayrollLocked: attendance.isPayrollLocked,
    reportContent: attendance.reportContent,
    reportSentAt: attendance.reportSentAt,
    studentCount: attendance.studentCount,
    studentCountA: attendance.studentCountA,
    studentCountB: attendance.studentCountB,
  });
  const { startTime, endTime } = splitTimeRange(time);
  const role: LeaveRole = attendance.actualTeacherId === input.teacherId ? "主教" : "助教";
  const nextCount = await semesterLeaveCount(input.teacherId) + 1;

  const existing = await prisma.$queryRawUnsafe<Array<{ id: number }>>(
    `SELECT "id" FROM "TeacherLeaveRequest"
     WHERE "teacherId" = ? AND "attendanceId" = ? AND "status" NOT IN ('${LEAVE_STATUS.cancelled}', '${LEAVE_STATUS.rejected}')
     LIMIT 1`,
    input.teacherId,
    input.attendanceId,
  );
  if (existing.length > 0) throw new Error("這堂課已經有請假申請，請等行政處理");

  await prisma.$executeRawUnsafe(
    `INSERT INTO "TeacherLeaveRequest"
      ("teacherId", "attendanceId", "courseId", "role", "leaveDate", "startTime", "endTime", "reason", "notes", "status", "semesterLeaveCountAtSubmit", "createdAt", "updatedAt")
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    input.teacherId,
    input.attendanceId,
    attendance.courseId,
    role,
    attendance.date,
    startTime,
    endTime,
    reason,
    input.notes?.trim() ?? "",
    LEAVE_STATUS.pending,
    nextCount,
  );

  const row = await prisma.$queryRawUnsafe<Array<{ id: number }>>(
    `SELECT "id" FROM "TeacherLeaveRequest"
     WHERE "teacherId" = ? AND "attendanceId" = ?
     ORDER BY "id" DESC
     LIMIT 1`,
    input.teacherId,
    input.attendanceId,
  );
  return { id: Number(row[0]?.id ?? 0), semesterLeaveCountAtSubmit: nextCount, time, role };
}

export async function cancellableLeaveChoices(teacherId: number) {
  await ensureTeacherLeaveTables();
  const rows = await prisma.$queryRawUnsafe<Array<{
    id: number;
    attendanceId: number;
    role: string;
    leaveDate: string | Date;
    startTime: string;
    endTime: string;
    status: string;
    school: string;
    courseType: string;
  }>>(
    `SELECT lr."id", lr."attendanceId", lr."role", lr."leaveDate", lr."startTime", lr."endTime", lr."status",
       c."school", c."courseType"
     FROM "TeacherLeaveRequest" lr
     JOIN "Course" c ON c."id" = lr."courseId"
     WHERE lr."teacherId" = ?
       AND lr."status" NOT IN ('${LEAVE_STATUS.cancelled}', '${LEAVE_STATUS.rejected}')
     ORDER BY lr."leaveDate" ASC, lr."id" ASC
     LIMIT 10`,
    teacherId,
  );
  return rows.map((row): LeaveCancelChoice => ({
    id: Number(row.id),
    attendanceId: Number(row.attendanceId),
    role: row.role === "助教" ? "助教" : "主教",
    status: row.status,
    date: toIsoDate(row.leaveDate),
    time: row.endTime ? `${row.startTime}-${row.endTime}` : row.startTime,
    school: row.school,
    courseType: courseLabel(row.courseType),
  }));
}

export async function cancelLeaveRequestByTeacher(input: { leaveRequestId: number; teacherId: number }) {
  await ensureTeacherLeaveTables();
  const leave = await getTeacherLeave(input.leaveRequestId);
  if (!leave) throw new Error("找不到請假申請");
  if (leave.teacherId !== input.teacherId) throw new Error("這筆請假申請不是您的，無法取消");
  if (leave.status === LEAVE_STATUS.cancelled) return { alreadyCancelled: true, leave };
  if (leave.status === LEAVE_STATUS.rejected) throw new Error("這筆請假已被駁回，不需要取消");
  if (leave.status === LEAVE_STATUS.found) {
    throw new Error("此請假已找到代課老師，不能由老師端直接取消，請聯絡行政重新處理。");
  }
  await prisma.$executeRawUnsafe(
    `UPDATE "TeacherLeaveRequest"
     SET "status" = ?, "updatedAt" = CURRENT_TIMESTAMP
     WHERE "id" = ? AND "teacherId" = ?`,
    LEAVE_STATUS.cancelled,
    input.leaveRequestId,
    input.teacherId,
  );
  return { alreadyCancelled: false, leave: { ...leave, status: LEAVE_STATUS.cancelled } };
}

export async function listTeacherLeaves() {
  return listTeacherLeavesFiltered();
}

export function normalizeLeaveStatusFilter(status: string | null | undefined) {
  const value = (status ?? "all").trim();
  const map: Record<string, string> = {
    all: "",
    pending: LEAVE_STATUS.pending,
    approved: LEAVE_STATUS.approved,
    searching: LEAVE_STATUS.searching,
    found: LEAVE_STATUS.found,
    rejected: LEAVE_STATUS.rejected,
    cancelled: LEAVE_STATUS.cancelled,
    全部: "",
    待審核: LEAVE_STATUS.pending,
    已核准: LEAVE_STATUS.approved,
    "已核准，待找代課": LEAVE_STATUS.approved,
    尋找代課中: LEAVE_STATUS.searching,
    已找到代課: LEAVE_STATUS.found,
    已駁回: LEAVE_STATUS.rejected,
    已取消: LEAVE_STATUS.cancelled,
  };
  return map[value] ?? value;
}

export async function listTeacherLeavesFiltered(options: TeacherLeaveListOptions = {}) {
  await ensureTeacherLeaveTables();
  const where: string[] = [];
  const params: unknown[] = [];
  if (options.year && options.month && options.month >= 1 && options.month <= 12) {
    const start = new Date(Date.UTC(options.year, options.month - 1, 1));
    const end = new Date(Date.UTC(options.year, options.month, 1));
    where.push('lr."leaveDate" >= ? AND lr."leaveDate" < ?');
    params.push(start, end);
  }
  const status = normalizeLeaveStatusFilter(options.status);
  if (status) {
    where.push('lr."status" = ?');
    params.push(status);
  }
  // includeDeleted is reserved for the future soft-delete phase. There is no deletedAt column yet.
  void options.includeDeleted;
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const rows = await prisma.$queryRawUnsafe<RawLeaveRow[]>(
    `SELECT
      lr."id", lr."teacherId", t."name" AS "teacherName",
      lr."attendanceId", lr."courseId", lr."role", lr."leaveDate", lr."startTime", lr."endTime",
      c."school", c."courseType", c."address",
      lr."reason", lr."notes", lr."status", lr."semesterLeaveCountAtSubmit",
      lr."reviewedBy", lr."reviewedAt", lr."rejectedReason", lr."createdAt",
      a."isPayrollLocked", a."studentCount", a."studentCountA", a."studentCountB", a."reportContent"
     FROM "TeacherLeaveRequest" lr
     JOIN "Teacher" t ON t."id" = lr."teacherId"
     JOIN "Attendance" a ON a."id" = lr."attendanceId"
     JOIN "Course" c ON c."id" = lr."courseId"
     ${whereSql}
     ORDER BY lr."leaveDate" ASC, lr."createdAt" DESC, lr."id" DESC`,
    ...params,
  );
  const ids = rows.map((row) => row.id);
  const inquiryRows = ids.length
    ? await prisma.$queryRawUnsafe<RawInquiryRow[]>(
      `SELECT si."id", si."leaveRequestId", si."candidateTeacherId",
        t."name" AS "candidateTeacherName", t."lineUserId" AS "candidateLineUserId", t."lineRegion" AS "candidateLineRegion",
        si."status", si."sentAt", si."respondedAt"
       FROM "SubstituteInquiry" si
       JOIN "Teacher" t ON t."id" = si."candidateTeacherId"
       WHERE si."leaveRequestId" IN (${ids.map(() => "?").join(",")})
       ORDER BY si."createdAt" ASC`,
      ...ids,
    )
    : [];
  const inquiryProfiles = await teacherTeachingProfiles(
    prisma,
    [...new Set(inquiryRows.map((inquiry) => Number(inquiry.candidateTeacherId)))],
  );
  const inquiriesByLeave = new Map<number, RawInquiryRow[]>();
  for (const inquiry of inquiryRows) {
    inquiriesByLeave.set(inquiry.leaveRequestId, [...(inquiriesByLeave.get(inquiry.leaveRequestId) ?? []), inquiry]);
  }
  return rows.map((row): TeacherLeaveListItem => {
    const time = row.endTime ? `${row.startTime}-${row.endTime}` : row.startTime;
    return {
      id: Number(row.id),
      teacherId: Number(row.teacherId),
      teacherName: row.teacherName,
      attendanceId: Number(row.attendanceId),
      courseId: Number(row.courseId),
      role: row.role === "助教" ? "助教" : "主教",
      leaveDate: toIsoDate(row.leaveDate),
      startTime: row.startTime,
      endTime: row.endTime,
      time,
      school: row.school,
      courseType: courseLabel(row.courseType),
      address: row.address,
      reason: row.reason,
      notes: row.notes,
      status: row.status,
      semesterLeaveCountAtSubmit: Number(row.semesterLeaveCountAtSubmit ?? 0),
      reviewedBy: row.reviewedBy,
      reviewedAt: toIsoStringOrNull(row.reviewedAt),
      rejectedReason: row.rejectedReason,
      createdAt: toIsoStringOrNull(row.createdAt) ?? "",
      isPayrollLocked: Boolean(row.isPayrollLocked),
      isReported: Boolean(row.reportContent?.trim() || row.studentCount != null || row.studentCountA != null || row.studentCountB != null),
      inquiries: (inquiriesByLeave.get(row.id) ?? []).map((inquiry) => ({
        id: Number(inquiry.id),
        candidateTeacherId: Number(inquiry.candidateTeacherId),
        candidateTeacherName: inquiry.candidateTeacherName,
        candidateLineUserId: inquiry.candidateLineUserId,
        candidateLineRegion: inquiry.candidateLineRegion ?? "",
        primaryRegionLabel: inquiryProfiles.get(Number(inquiry.candidateTeacherId))?.primaryRegionLabel,
        primarySpecialtyLabel: inquiryProfiles.get(Number(inquiry.candidateTeacherId))?.primarySpecialtyLabel,
        recentAttendanceCount: inquiryProfiles.get(Number(inquiry.candidateTeacherId))?.recentAttendanceCount,
        primaryCourseTypes: inquiryProfiles.get(Number(inquiry.candidateTeacherId))?.primaryCourseTypes,
        status: inquiry.status,
        sentAt: toIsoStringOrNull(inquiry.sentAt),
        respondedAt: toIsoStringOrNull(inquiry.respondedAt),
      })),
    };
  });
}

export async function getTeacherLeave(id: number) {
  return (await listTeacherLeaves()).find((item) => item.id === id) ?? null;
}

export async function markLeaveReviewed(id: number, status: string, options: { rejectedReason?: string; reviewedBy?: string } = {}) {
  await ensureTeacherLeaveTables();
  await prisma.$executeRawUnsafe(
    `UPDATE "TeacherLeaveRequest"
     SET "status" = ?, "reviewedBy" = ?, "reviewedAt" = CURRENT_TIMESTAMP, "rejectedReason" = ?, "updatedAt" = CURRENT_TIMESTAMP
     WHERE "id" = ?`,
    status,
    options.reviewedBy ?? "管理端",
    options.rejectedReason ?? "",
    id,
  );
}

export async function upsertSubstituteInquiry(leaveRequestId: number, attendanceId: number, candidateTeacherId: number) {
  await ensureTeacherLeaveTables();
  await prisma.$executeRawUnsafe(
    `INSERT INTO "SubstituteInquiry"
      ("leaveRequestId", "attendanceId", "candidateTeacherId", "status", "sentAt", "createdAt", "updatedAt")
     VALUES (?, ?, ?, '${INQUIRY_STATUS.pending}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON CONFLICT("leaveRequestId", "candidateTeacherId") DO UPDATE SET
      "status" = '${INQUIRY_STATUS.pending}',
      "sentAt" = CURRENT_TIMESTAMP,
      "respondedAt" = NULL,
      "updatedAt" = CURRENT_TIMESTAMP`,
    leaveRequestId,
    attendanceId,
    candidateTeacherId,
  );
  const rows = await prisma.$queryRawUnsafe<Array<{ id: number }>>(
    `SELECT "id" FROM "SubstituteInquiry" WHERE "leaveRequestId" = ? AND "candidateTeacherId" = ? LIMIT 1`,
    leaveRequestId,
    candidateTeacherId,
  );
  return Number(rows[0]?.id ?? 0);
}

export async function updateInquiryResponse(inquiryId: number, status: string) {
  await ensureTeacherLeaveTables();
  await prisma.$executeRawUnsafe(
    `UPDATE "SubstituteInquiry"
     SET "status" = ?, "respondedAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
     WHERE "id" = ?`,
    status,
    inquiryId,
  );
}

export async function getInquiryWithLeave(inquiryId: number) {
  await ensureTeacherLeaveTables();
  const rows = await prisma.$queryRawUnsafe<Array<RawInquiryRow & RawLeaveRow>>(
    `SELECT
      si."id", si."leaveRequestId", si."candidateTeacherId", si."status", si."sentAt", si."respondedAt",
      ct."name" AS "candidateTeacherName", ct."lineUserId" AS "candidateLineUserId", ct."lineRegion" AS "candidateLineRegion",
      lr."teacherId", ot."name" AS "teacherName", lr."attendanceId", lr."courseId", lr."role", lr."leaveDate",
      lr."startTime", lr."endTime", c."school", c."courseType", c."address", lr."reason", lr."notes",
      lr."status" AS "leaveStatus", lr."semesterLeaveCountAtSubmit", lr."reviewedBy", lr."reviewedAt",
      lr."rejectedReason", lr."createdAt", a."isPayrollLocked", a."studentCount", a."studentCountA", a."studentCountB", a."reportContent"
     FROM "SubstituteInquiry" si
     JOIN "TeacherLeaveRequest" lr ON lr."id" = si."leaveRequestId"
     JOIN "Teacher" ct ON ct."id" = si."candidateTeacherId"
     JOIN "Teacher" ot ON ot."id" = lr."teacherId"
     JOIN "Attendance" a ON a."id" = lr."attendanceId"
     JOIN "Course" c ON c."id" = lr."courseId"
     WHERE si."id" = ?
     LIMIT 1`,
    inquiryId,
  );
  return rows[0] ?? null;
}
