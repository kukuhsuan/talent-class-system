import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { attendanceHoursFromCourseTime } from "@/lib/courseHours";
import { taipeiDateIso } from "@/lib/courseDates";
import { createAttendancesForUniqueDays } from "@/lib/attendanceBatch";
import { stampAttendanceTime } from "@/lib/attendanceTime";
import { courseDateWindowWhere, courseIdsWithAnyAttendance, dayBounds, dayNameOfIso } from "@/lib/scheduleLogic";
import { isWaitingTeacherName } from "@/lib/teacherAssignment";

export type ArrivalReminderKind = "pre" | "late";
export type ArrivalStatus =
  | "not_due"
  | "pre_missing"
  | "late_missing"
  | "expired_missing"
  | "arrived"
  | "arrived_late";

type ArrivalColumns = {
  id: number;
  teacherArrivedAt: Date | string | null;
  arrivalReminderSentAt: Date | string | null;
  arrivalLateReminderSentAt: Date | string | null;
};

type TeacherLite = {
  id: number;
  name: string;
  lineUserId: string | null;
  lineRegion: string | null;
};

type ArrivalRow = {
  id: number;
  date: Date;
  cancelled: boolean;
  course: {
    id: number;
    school: string;
    courseType: string;
    time: string;
    category: string;
    startDate?: Date | null;
    endDate?: Date | null;
    schoolRel?: { address?: string } | null;
  };
  actualTeacher: TeacherLite;
  actualTeacherId: number;
  assistantTeacher?: TeacherLite | null;
  assistantTeacherId?: number | null;
};

export type ArrivalDetail = {
  attendanceId: number;
  date: string;
  school: string;
  courseType: string;
  time: string;
  teacherName: string;
  teacherLineUserId: string | null;
  teacherLineRegion: string | null;
  expectedArrivalTime: string;
  arrivedAt: string | null;
  status: ArrivalStatus;
  statusLabel: string;
  lateMinutes: number;
  reminderSent: boolean;
  lateReminderSent: boolean;
  canPushLine: boolean;
};

const ARRIVAL_GRACE_MINUTES = 10;

export async function ensureArrivalColumns() {
  const statements = [
    'ALTER TABLE Attendance ADD COLUMN teacherArrivedAt DATETIME',
    'ALTER TABLE Attendance ADD COLUMN arrivalReminderSentAt DATETIME',
    'ALTER TABLE Attendance ADD COLUMN arrivalLateReminderSentAt DATETIME',
    'ALTER TABLE Attendance ADD COLUMN lastArrivalClickAt DATETIME',
  ];
  for (const statement of statements) {
    await prisma.$executeRawUnsafe(statement).catch(() => undefined);
  }
}

export function parseCourseStartMinutes(time: string | null | undefined) {
  const match = String(time ?? "").match(/(\d{1,2})[:：](\d{2})/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return hour * 60 + minute;
}

function parseCourseEndMinutes(time: string | null | undefined) {
  const matches = [...String(time ?? "").matchAll(/(\d{1,2})[:：](\d{2})/g)];
  if (matches.length < 2) return null;
  const hour = Number(matches[1][1]);
  const minute = Number(matches[1][2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return hour * 60 + minute;
}

export function formatClock(minutes: number) {
  const normalized = ((minutes % 1440) + 1440) % 1440;
  const hour = Math.floor(normalized / 60);
  const minute = normalized % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function taipeiParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return {
    iso: `${get("year")}-${get("month")}-${get("day")}`,
    minutes: Number(get("hour")) * 60 + Number(get("minute")),
    clock: `${get("hour")}:${get("minute")}`,
  };
}

function localMinutesOfDate(date: Date | string | null | undefined) {
  if (!date) return null;
  const value = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(value.getTime())) return null;
  return taipeiParts(value).minutes;
}

function localClockOfDate(date: Date | string | null | undefined) {
  if (!date) return null;
  const value = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(value.getTime())) return null;
  return taipeiParts(value).clock;
}

function messageTime(time: string) {
  return time.replace(/\s*[-–—~～]\s*/g, "－");
}

// 一律以出勤紀錄的主教為準（代課確認後 assignSubstitute 已同步 actualTeacherId；
// 後台直接改老師也以出勤為主，不再回頭看代課紀錄，避免通知發給錯的老師）
function responsibleTeacher(row: ArrivalRow): TeacherLite {
  return row.actualTeacher;
}

async function arrivalColumnMap(ids: number[]) {
  await ensureArrivalColumns();
  if (ids.length === 0) return new Map<number, ArrivalColumns>();
  const placeholders = ids.map(() => "?").join(",");
  const rows = await prisma.$queryRawUnsafe<ArrivalColumns[]>(
    `SELECT id, teacherArrivedAt, arrivalReminderSentAt, arrivalLateReminderSentAt FROM Attendance WHERE id IN (${placeholders})`,
    ...ids,
  );
  return new Map(rows.map((row) => [row.id, row]));
}

async function arrivalRowsForDate(input: { dateIso: string; teacherId?: number; dept?: string; createMissing?: boolean }) {
  const { start, end } = dayBounds(input.dateIso);
  const dayName = dayNameOfIso(input.dateIso);
  const courseWindow = courseDateWindowWhere(input.dateIso);
  const courseTeacherFilter: Prisma.CourseWhereInput = input.teacherId
    ? { OR: [{ teacherId: input.teacherId }, { assistantTeacherId: input.teacherId }] }
    : {};
  const attendanceTeacherFilter: Prisma.AttendanceWhereInput = input.teacherId
    ? { OR: [{ actualTeacherId: input.teacherId }, { assistantTeacherId: input.teacherId }] }
    : {};
  const deptFilter: Prisma.CourseWhereInput = input.dept ? { department: input.dept } : {};

  if (input.createMissing) {
    const datedCourseIds = await courseIdsWithAnyAttendance({ isActive: true, ...courseWindow, ...courseTeacherFilter, ...deptFilter }, start);
    const weekdayCourses = await prisma.course.findMany({
      where: {
        isActive: true,
        ...courseWindow,
        ...courseTeacherFilter,
        ...deptFilter,
        dayOfWeek: dayName,
        ...(datedCourseIds.size > 0 ? { id: { notIn: [...datedCourseIds] } } : {}),
      },
    });
    for (const course of weekdayCourses) {
      const calculated = attendanceHoursFromCourseTime(course.time || "");
      const result = await createAttendancesForUniqueDays([input.dateIso], {
        courseId: course.id,
        actualTeacherId: course.teacherId,
        assistantTeacherId: course.assistantTeacherId,
        category: course.category,
        hours: calculated.hours,
        notes: calculated.needsReview ? `上課時間需人工確認：${calculated.reason}` : "",
      });
      if (result.records.length > 0) {
        await stampAttendanceTime(course.id, [input.dateIso], course.time || "").catch(() => undefined);
      }
    }
  }

  return prisma.attendance.findMany({
    where: {
      cancelled: false,
      date: { gte: start, lt: end },
      ...attendanceTeacherFilter,
      course: { isActive: true, ...courseWindow, ...deptFilter },
    },
    include: {
      course: { include: { schoolRel: true } },
      actualTeacher: true,
      assistantTeacher: true,
    },
    orderBy: [{ date: "asc" }, { id: "asc" }],
  }) as unknown as Promise<ArrivalRow[]>;
}

export async function arrivalDetailsForDate(input: { dateIso?: string; teacherId?: number; dept?: string; createMissing?: boolean; now?: Date }) {
  const dateIso = input.dateIso ?? taipeiDateIso(input.now);
  const nowParts = taipeiParts(input.now);
  const rows = await arrivalRowsForDate({ dateIso, teacherId: input.teacherId, dept: input.dept, createMissing: input.createMissing });
  const columnMap = await arrivalColumnMap(rows.map((row) => row.id));

  return rows
    .map((row): ArrivalDetail | null => {
      const startMinutes = parseCourseStartMinutes(row.course.time);
      if (startMinutes === null) return null;
      const endMinutes = parseCourseEndMinutes(row.course.time) ?? startMinutes + 90;
      const expectedMinutes = startMinutes - ARRIVAL_GRACE_MINUTES;
      const columns = columnMap.get(row.id);
      const teacher = responsibleTeacher(row);
      const arrivedAt = columns?.teacherArrivedAt ?? null;
      const arrivedMinutes = localMinutesOfDate(arrivedAt);
      const lateMinutes = arrivedMinutes === null ? 0 : Math.max(0, arrivedMinutes - startMinutes);
      let status: ArrivalStatus = "not_due";
      if (arrivedAt) status = lateMinutes > 0 ? "arrived_late" : "arrived";
      else if (nowParts.iso === dateIso && nowParts.minutes >= endMinutes) status = "expired_missing";
      else if (nowParts.iso === dateIso && nowParts.minutes >= startMinutes) status = "late_missing";
      else if (nowParts.iso === dateIso && nowParts.minutes >= expectedMinutes) status = "pre_missing";

      const statusLabel = status === "arrived"
        ? "已到校"
        : status === "arrived_late"
          ? `遲到 ${lateMinutes} 分鐘`
          : status === "expired_missing"
            ? "課程已結束未打卡"
          : status === "late_missing"
            ? "課程已開始仍未打卡"
            : status === "pre_missing"
              ? "已提醒未到校"
              : "尚未到提醒時間";

      return {
        attendanceId: row.id,
        date: dateIso,
        school: row.course.school,
        courseType: row.course.courseType,
        time: row.course.time,
        teacherName: teacher.name,
        teacherLineUserId: teacher.lineUserId,
        teacherLineRegion: teacher.lineRegion,
        expectedArrivalTime: formatClock(expectedMinutes),
        arrivedAt: localClockOfDate(arrivedAt),
        status,
        statusLabel,
        lateMinutes,
        reminderSent: Boolean(columns?.arrivalReminderSentAt),
        lateReminderSent: Boolean(columns?.arrivalLateReminderSentAt),
        canPushLine: Boolean(teacher.lineUserId && teacher.lineRegion && !isWaitingTeacherName(teacher.name)),
      };
    })
    .filter((item): item is ArrivalDetail => Boolean(item));
}

export async function recordTeacherArrival(lineUserId: string, now = new Date()) {
  await ensureArrivalColumns();
  const teacher = await prisma.teacher.findFirst({
    where: { lineUserId },
    select: { id: true, name: true },
  });
  if (!teacher) return { ok: false as const, message: "找不到您的老師資料，請先完成綁定。" };

  const dateIso = taipeiDateIso(now);
  const nowParts = taipeiParts(now);
  const rowsById = await arrivalRowsForDate({ dateIso, teacherId: teacher.id, createMissing: true });
  const rows = rowsById.length > 0
    ? rowsById
    : (await arrivalRowsForDate({ dateIso, createMissing: false }))
      .filter((row) => responsibleTeacher(row).name.trim() === teacher.name.trim());
  const columnMap = await arrivalColumnMap(rows.map((row) => row.id));
  const candidates = rows
    .map((row) => {
      const start = parseCourseStartMinutes(row.course.time);
      const end = parseCourseEndMinutes(row.course.time) ?? (start === null ? null : start + 90);
      return { row, start, end };
    })
    .filter((item) => {
      const responsible = responsibleTeacher(item.row);
      return responsible.id === teacher.id || responsible.name.trim() === teacher.name.trim();
    })
    .filter((item) => item.start !== null)
    .filter((item) => nowParts.minutes >= (item.start ?? 0) - 120 && nowParts.minutes <= (item.end ?? (item.start ?? 0) + 90) + 60)
    .sort((a, b) => Math.abs(nowParts.minutes - (a.start ?? 0)) - Math.abs(nowParts.minutes - (b.start ?? 0)));

  const selected = candidates[0]?.row;
  if (!selected) {
    return { ok: false as const, message: `${teacher.name} 老師，目前找不到可打卡的今日課程。若課程資料有誤，請聯絡行政確認。` };
  }

  const existing = columnMap.get(selected.id)?.teacherArrivedAt ?? null;
  const startMinutes = parseCourseStartMinutes(selected.course.time) ?? nowParts.minutes;
  const expectedMinutes = startMinutes - ARRIVAL_GRACE_MINUTES;
  const arrivedMinutes = existing ? localMinutesOfDate(existing) ?? nowParts.minutes : nowParts.minutes;
  const lateMinutes = Math.max(0, arrivedMinutes - startMinutes);

  await prisma.$executeRawUnsafe(
    "UPDATE Attendance SET teacherArrivedAt = COALESCE(teacherArrivedAt, ?), lastArrivalClickAt = ? WHERE id = ?",
    now,
    now,
    selected.id,
  );

  const base = existing ? "您已完成到校打卡，系統保留第一次到校時間。" : "已收到您的到校打卡。";
  const message = lateMinutes > 0
    ? `${base}\n\n本堂課應到校時間：${formatClock(expectedMinutes)}\n您的到校時間：${formatClock(arrivedMinutes)}\n系統記錄：遲到 ${lateMinutes} 分鐘\n\n請後續務必提早到校，謝謝配合。`
    : `${base}\n\n本堂課應到校時間：${formatClock(expectedMinutes)}\n您的到校時間：${formatClock(arrivedMinutes)}\n系統記錄：準時到校`;

  return { ok: true as const, attendanceId: selected.id, message };
}

export async function hasTeacherArrived(attendanceId: number) {
  await ensureArrivalColumns();
  const rows = await prisma.$queryRawUnsafe<Array<{ teacherArrivedAt: Date | string | null }>>(
    "SELECT teacherArrivedAt FROM Attendance WHERE id = ? LIMIT 1",
    attendanceId,
  );
  return Boolean(rows[0]?.teacherArrivedAt);
}

export function reminderKindForDetail(detail: ArrivalDetail): ArrivalReminderKind | null {
  if (detail.arrivedAt) return null;
  if (detail.status === "late_missing" && !detail.lateReminderSent) return "late";
  if (detail.status === "pre_missing" && !detail.reminderSent) return "pre";
  return null;
}

export function buildArrivalReminderText(detail: ArrivalDetail, kind: ArrivalReminderKind) {
  const time = messageTime(detail.time);
  if (kind === "late") {
    return `⚠️ 老師提醒一下～\n\n您的課程已經開始了，目前還沒看到【到校】打卡。\n\n時間：${time}\n園所：${detail.school}\n課程：${detail.courseType}\n\n請老師盡快確認狀況。\n已到校的話，請先補按【到校】喔！`;
  }
  return `⏰ 老師提醒一下～\n\n您的課程快開始了，目前還沒看到【到校】打卡。\n\n時間：${time}\n園所：${detail.school}\n課程：${detail.courseType}\n應到校：${detail.expectedArrivalTime}\n\n已到校的話，再麻煩幫我按一下【到校】喔！`;
}

export async function markArrivalReminderSent(attendanceId: number, kind: ArrivalReminderKind, sentAt = new Date()) {
  await ensureArrivalColumns();
  const column = kind === "late" ? "arrivalLateReminderSentAt" : "arrivalReminderSentAt";
  await prisma.$executeRawUnsafe(`UPDATE Attendance SET ${column} = COALESCE(${column}, ?) WHERE id = ?`, sentAt, attendanceId);
}
