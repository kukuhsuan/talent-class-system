import { prisma } from "@/lib/prisma";
import { calculateCourseHours } from "@/lib/courseHours";
import { taipeiDateIso, utcStartOfNextIsoDay } from "@/lib/courseDates";
import { parseAttendanceDay } from "@/lib/attendanceBatch";
import { coursePayrollHoursForAttendance } from "@/lib/payrollHours";
import { attendanceHoursOverrideMap, ensureAttendanceHoursOverrideColumn } from "@/lib/attendanceHoursOverride";
import { normalizeCategory } from "@/lib/courseMeta";
import { isWaitingTeacherName, WAITING_TEACHER_NAME } from "@/lib/teacherAssignment";
import { OPEN_LEAVE_STATUSES } from "@/lib/leaveStatus";

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

// 純函式版：schema 已含 scheduledTime 欄位，熱路徑可直接用 findMany 撈到的值過濾，省一次 raw SQL 來回
export function usableScheduledTime(value: string | null | undefined) {
  return isUsableScheduledTime(value) ? String(value ?? "") : "";
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

/**
 * 把課程時間蓋到指定日期的出勤上（只補還沒填的）。
 *
 * 原本的寫法是 `substr("date", 1, 10) IN (?, ?)`，拿去和 "2026-08-05" 這種字串比。
 * 但 Prisma 在 SQLite/libSQL 把 DateTime 存成整數毫秒，substr(1754352000000, 1, 10)
 * 得到的是 "1754352000"，永遠不會等於任何一個日期字串 —— 這個 UPDATE 一筆都沒更新過。
 * scheduledTime 是「這堂課是否已過上課時間、可以回報了」的依據，它填不進去會讓
 * 待回報判斷、遲到提醒、到校提醒全部變得不可預期。
 *
 * 改法：日期比對交給 Prisma（它知道欄位真正的儲存格式），先撈出 id，
 * 再用原生 SQL 依 id 更新。scheduledTime 是執行期 ALTER TABLE 加的欄位、
 * 不在 schema.prisma 裡，所以寫入這一段還是得走原生 SQL。
 */
export async function stampAttendanceTime(courseId: number, dates: string[], time: string) {
  const unique = [...new Set(dates.map((date) => date.slice(0, 10)).filter(Boolean))];
  if (unique.length === 0) return;
  if (!(await ensureAttendanceScheduledTimeColumn())) return;

  const targets = await prisma.attendance.findMany({
    where: { courseId, date: { in: unique.map((iso) => parseAttendanceDay(iso)) } },
    select: { id: true },
  });
  if (targets.length === 0) return;

  const placeholders = targets.map(() => "?").join(",");
  await prisma.$executeRawUnsafe(
    `UPDATE "Attendance"
     SET "scheduledTime" = ?
     WHERE "id" IN (${placeholders})
       AND ("scheduledTime" IS NULL OR "scheduledTime" = '')`,
    time,
    ...targets.map((row) => row.id),
  );
}

export async function syncFutureUnreportedAttendanceTime(courseId: number, time: string, payrollHours?: number | null, fromIso = taipeiDateIso(), department?: string) {
  void department;
  if (!(await ensureAttendanceScheduledTimeColumn())) return;
  const calculated = coursePayrollHoursForAttendance(payrollHours, time);
  // 和 stampAttendanceTime 同一個病：substr("date", 1, 10) >= "2026-08-05" 永遠不成立。
  // 條件交給 Prisma 篩，只有寫入 scheduledTime（執行期欄位）留在原生 SQL。
  await ensureAttendanceHoursOverrideColumn();
  const candidates = await prisma.attendance.findMany({
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
    select: { id: true },
  });
  // 行政單堂改過時數的課不跟著課程走，否則改課程時間會默默把人工調整蓋掉
  const overrideMap = await attendanceHoursOverrideMap(candidates.map((row) => row.id));
  const targetIds = candidates.filter((row) => overrideMap.get(row.id) !== true).map((row) => row.id);
  if (targetIds.length === 0) return;

  const placeholders = targetIds.map(() => "?").join(",");
  await prisma.$executeRawUnsafe(
    `UPDATE "Attendance"
     SET "scheduledTime" = ?,
         "hours" = ?
     WHERE "id" IN (${placeholders})`,
    time,
    calculated.hours,
    ...targetIds,
  );
}

export async function syncFutureUnreportedAttendanceHours(courseId: number, time: string, payrollHours?: number | null, fromIso = taipeiDateIso()) {
  const calculated = coursePayrollHoursForAttendance(payrollHours, time);
  const futureFromIso = utcStartOfNextIsoDay(fromIso).toISOString().slice(0, 10);
  const where = {
    courseId,
    date: { gte: parseAttendanceDay(futureFromIso) },
    cancelled: false,
    isPayrollLocked: false,
    reportContent: "",
    reportSentAt: null,
  };
  // 同上：跳過行政單堂改過時數的課
  const candidates = await prisma.attendance.findMany({ where, select: { id: true } });
  const overrideMap = await attendanceHoursOverrideMap(candidates.map((row) => row.id));
  const targetIds = candidates.filter((row) => overrideMap.get(row.id) !== true).map((row) => row.id);
  if (targetIds.length === 0) return { count: 0 };
  return prisma.attendance.updateMany({
    where: { id: { in: targetIds } },
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
      // 核准請假後課會被標成「待排老師」等指派代課。換課程主檔老師時把這些課一起改掉，
      // 等於在行政不知情的情況下把課塞給新老師，首頁的「待指派代課」提醒也會跟著消失。
      leaveRequests: { none: { status: { in: OPEN_LEAVE_STATUSES } } },
    },
    data: { actualTeacherId: teacherId },
  });
}

export async function syncFutureUnreportedAttendanceTeacher(
  courseId: number,
  teacherId: number,
  fromIso = taipeiDateIso(),
) {
  return prisma.attendance.updateMany({
    where: {
      courseId,
      date: { gte: utcStartOfNextIsoDay(fromIso) },
      cancelled: false,
      isPayrollLocked: false,
      reportContent: "",
      reportSentAt: null,
      AND: [
        { OR: [{ studentCount: null }, { studentCount: 0 }] },
        { OR: [{ studentCountA: null }, { studentCountA: 0 }] },
        { OR: [{ studentCountB: null }, { studentCountB: 0 }] },
      ],
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
