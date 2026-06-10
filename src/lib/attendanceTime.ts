import { prisma } from "@/lib/prisma";
import { taipeiDateIso, utcStartOfNextIsoDay } from "@/lib/courseDates";
import { parseAttendanceDay } from "@/lib/attendanceBatch";
import { coursePayrollHoursForAttendance } from "@/lib/payrollHours";
import { normalizeCategory } from "@/lib/courseMeta";

// Module-level flag: avoids repeated PRAGMA table_info round-trips within the same process lifetime.
// (Mirrors the pattern used by coursePayrollColumnReady in payrollHours.ts)
let scheduledTimeColumnReady = false;

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
  return new Map(rows.map((row) => [row.id, row.scheduledTime ?? ""]));
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
  if (department === "安親班") return;
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

export async function syncFutureUnreportedAttendanceAssistant(courseId: number, assistantTeacherId: number | null, fromIso = taipeiDateIso(), department?: string) {
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
    data: { assistantTeacherId },
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
