import { prisma } from "@/lib/prisma";
import { calculateCourseHours } from "@/lib/courseHours";
import { taipeiDateIso, utcStartOfNextIsoDay } from "@/lib/courseDates";
import { parseAttendanceDay } from "@/lib/attendanceBatch";
import { coursePayrollHoursForAttendance } from "@/lib/payrollHours";
import { normalizeCategory } from "@/lib/courseMeta";
import { isWaitingTeacherName, WAITING_TEACHER_NAME } from "@/lib/teacherAssignment";

// Module-level flag: avoids repeated PRAGMA table_info round-trips within the same process lifetime.
// (Mirrors the pattern used by coursePayrollColumnReady in payrollHours.ts)
let scheduledTimeColumnReady = false;

function isUsableScheduledTime(value: string | null | undefined) {
  const text = String(value ?? "").trim();
  if (!text) return false;
  const compact = text
    .replace(/[－–—]/g, "-")
    .replace(/[～~]/g, "-")
    .replace(/至|到/g, "-")
    .replace(/：/g, ":")
    .replace(/\s+/g, "");
  return /^\d{1,2}:\d{2}-\d{1,2}:\d{2}$/.test(compact);
}

function normalizedUsableTime(value: string | null | undefined) {
  const parsed = calculateCourseHours(value);
  return parsed.needsReview ? "" : parsed.time;
}

function numericHours(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

function sameHours(a: number | null | undefined, b: number | null | undefined) {
  return a !== null && a !== undefined && b !== null && b !== undefined && Math.abs(a - b) < 0.01;
}

export function effectiveAttendanceTime(input: {
  scheduledTime?: string | null;
  courseTime?: string | null;
  attendanceHours?: unknown;
  isPayrollLocked?: boolean | number | null;
  reportContent?: string | null;
  reportSentAt?: Date | string | null;
  studentCount?: number | null;
  studentCountA?: number | null;
  studentCountB?: number | null;
}) {
  const scheduled = normalizedUsableTime(input.scheduledTime);
  const course = normalizedUsableTime(input.courseTime);
  if (!scheduled) return course || String(input.courseTime ?? "").trim();
  if (!course) return scheduled;

  const attendanceHours = numericHours(input.attendanceHours);
  const scheduledHours = calculateCourseHours(scheduled).hours;
  const courseHours = calculateCourseHours(course).hours;
  if (attendanceHours && sameHours(attendanceHours, courseHours) && !sameHours(attendanceHours, scheduledHours)) {
    return course;
  }

  const hasReportData = Boolean(String(input.reportContent ?? "").trim())
    || Boolean(input.reportSentAt)
    || input.studentCount !== null && input.studentCount !== undefined
    || input.studentCountA !== null && input.studentCountA !== undefined
    || input.studentCountB !== null && input.studentCountB !== undefined;
  if (!input.isPayrollLocked && !hasReportData && scheduled !== course) return course;

  return scheduled;
}

async function hasAttendanceScheduledTimeColumn() {
  if (scheduledTimeColumnReady) return true;
  const columns = await prisma.$queryRawUnsafe<Array<{ name: string }>>('PRAGMA table_info("Attendance")');
  return columns.some((column) => column.name === "scheduledTime");
}

export async function ensureAttendanceScheduledTimeColumn() {
  if (scheduledTimeColumnReady) return true;
  if (await hasAttendanceScheduledTimeColumn()) {
    scheduledTimeColumnReady = true;
    return true;
  }

  await prisma.$executeRawUnsafe(
    'ALTER TABLE "Attendance" ADD COLUMN "scheduledTime" TEXT DEFAULT \'\'',
  ).catch(() => undefined);

  const exists = await hasAttendanceScheduledTimeColumn();
  if (exists) scheduledTimeColumnReady = true;
  return exists;
}

export async function attendanceScheduledTimeMap(attendanceIds: number[]) {
  const ids = [...new Set(attendanceIds.filter((id) => Number.isFinite(id)))];
  if (ids.length === 0) return new Map<number, string>();
  if (!(await ensureAttendanceScheduledTimeColumn())) return new Map<number, string>();

  const placeholders = ids.map(() => "?").join(",");
  const rows = await prisma.$queryRawUnsafe<Array<{ id: number; scheduledTime: string | null }>>(
    `SELECT "id", "scheduledTime" FROM "Attendance" WHERE "id" IN (${placeholders})`,
    ...ids,
  );
  return new Map(rows.map((row) => [row.id, isUsableScheduledTime(row.scheduledTime) ? row.scheduledTime ?? "" : ""]));
}

export async function stampAttendanceTime(courseId: number, dates: string[], time: string) {
  const unique = [...new Set(dates.map((date) => date.slice(0, 10)).filter(Boolean))];
  if (unique.length === 0) return;
  if (!(await ensureAttendanceScheduledTimeColumn())) return;

  const placeholders = unique.map(() => "?").join(",");
  await prisma.$executeRawUnsafe(
    `UPDATE "Attendance"
     SET "scheduledTime" = ?
     WHERE "courseId" = ?
       AND substr("date", 1, 10) IN (${placeholders})
       AND ("scheduledTime" IS NULL OR "scheduledTime" = '')`,
    time,
    courseId,
    ...unique,
  );
}

export async function syncFutureUnreportedAttendanceTime(courseId: number, time: string, payrollHours?: number | null, fromIso = taipeiDateIso(), department?: string) {
  void department;
  if (!(await ensureAttendanceScheduledTimeColumn())) return;
  const calculated = coursePayrollHoursForAttendance(payrollHours, time);
  const futureFromIso = utcStartOfNextIsoDay(fromIso).toISOString().slice(0, 10);
  await prisma.$executeRawUnsafe(
    `UPDATE "Attendance"
     SET "scheduledTime" = ?,
         "hours" = ?
     WHERE "courseId" = ?
       AND substr("date", 1, 10) >= ?
       AND "cancelled" = 0
       AND "isPayrollLocked" = 0
       AND "reportContent" = ''
       AND "reportSentAt" IS NULL
       AND "studentCount" IS NULL
       AND "studentCountA" IS NULL
       AND "studentCountB" IS NULL`,
    time,
    calculated.hours,
    courseId,
    futureFromIso,
  );
}

export async function syncFutureUnreportedAttendanceHours(courseId: number, time: string, payrollHours?: number | null, fromIso = taipeiDateIso()) {
  const calculated = coursePayrollHoursForAttendance(payrollHours, time);
  const futureFromIso = utcStartOfNextIsoDay(fromIso).toISOString().slice(0, 10);
  return prisma.attendance.updateMany({
    where: {
      courseId,
      date: { gte: parseAttendanceDay(futureFromIso) },
      cancelled: false,
      isPayrollLocked: false,
      reportContent: "",
      reportSentAt: null,
    },
    data: { hours: calculated.hours },
  });
}

export async function syncFutureUnreportedAttendanceAssistant(
  courseId: number,
  assistantTeacherId: number | null,
  fromIso = taipeiDateIso(),
  department?: string,
  previousAssistantTeacherId?: number | null,
) {
  if (department === "安親班") return;
  return prisma.attendance.updateMany({
    where: {
      courseId,
      ...(previousAssistantTeacherId !== undefined ? { assistantTeacherId: previousAssistantTeacherId } : {}),
      date: { gte: utcStartOfNextIsoDay(fromIso) },
      cancelled: false,
      isPayrollLocked: false,
      reportContent: "",
      reportSentAt: null,
      studentCount: null,
      studentCountA: null,
      studentCountB: null,
    },
    data: { assistantTeacherId },
  });
}

export async function syncUnreportedWaitingTeacherAttendance(
  courseId: number,
  teacherId: number,
) {
  const [waitingTeachers, teacher] = await Promise.all([
    prisma.teacher.findMany({
      where: { name: { contains: WAITING_TEACHER_NAME } },
      select: { id: true, name: true },
    }),
    prisma.teacher.findUnique({ where: { id: teacherId }, select: { name: true } }),
  ]);
  const waitingTeacherIds = waitingTeachers.filter((item) => isWaitingTeacherName(item.name)).map((item) => item.id);
  if (waitingTeacherIds.length === 0 || !teacher || isWaitingTeacherName(teacher.name)) {
    return { count: 0 };
  }

  return prisma.attendance.updateMany({
    where: {
      courseId,
      actualTeacherId: { in: waitingTeacherIds },
      cancelled: false,
      isPayrollLocked: false,
      reportContent: "",
      reportSentAt: null,
      substitutes: { none: {} },
    },
    data: { actualTeacherId: teacherId },
  });
}

export async function syncFutureUnreportedAttendanceCategory(courseId: number, category: string, fromIso = taipeiDateIso(), department?: string) {
  if (department === "安親班") return;
  return prisma.attendance.updateMany({
    where: {
      courseId,
      date: { gte: utcStartOfNextIsoDay(fromIso) },
      cancelled: false,
      isPayrollLocked: false,
      reportContent: "",
      reportSentAt: null,
      studentCount: null,
      studentCountA: null,
      studentCountB: null,
    },
    data: { category: normalizeCategory(category) },
  });
}

export async function pruneFutureUnreportedAttendanceDates(courseId: number, keepDates: string[], fromIso = taipeiDateIso()) {
  const unique = [...new Set(keepDates.map((date) => date.slice(0, 10)).filter(Boolean))];
  if (unique.length === 0) return { count: 0 };

  return prisma.attendance.deleteMany({
    where: {
      courseId,
      date: {
        gte: utcStartOfNextIsoDay(fromIso),
        notIn: unique.map(parseAttendanceDay),
      },
      cancelled: false,
      isPayrollLocked: false,
      reportContent: "",
      reportSentAt: null,
      studentCount: null,
      studentCountA: null,
      studentCountB: null,
    },
  });
}
