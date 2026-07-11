import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { parseAttendanceDay } from "@/lib/attendanceBatch";
import { coursePayrollHoursForAttendance } from "@/lib/payrollHours";

export const COURSE_CHANGE_STATUS = {
  draft: "草稿",
  pendingReview: "待行政審核",
  pendingTeacher: "待老師回覆",
  teacherAvailable: "老師可配合",
  teacherUnavailable: "老師無法配合",
  discuss: "需要討論",
  confirmed: "已確認",
  completed: "已完成",
  cancelled: "已取消",
} as const;

export const COURSE_CHANGE_TYPES = ["DATE", "TIME", "LOCATION", "STUDENT_COUNT", "CANCEL"] as const;
export type CourseChangeType = (typeof COURSE_CHANGE_TYPES)[number];
export const COURSE_CHANGE_REASONS = ["園所活動", "教室調整", "時間調整", "臨時狀況", "其他"] as const;

type DbClient = PrismaClient | Prisma.TransactionClient;

export const courseChangeInclude = {
  course: { include: { schoolRel: true } },
  teacher: { select: { id: true, name: true, lineUserId: true, lineRegion: true } },
  targets: {
    include: {
      attendance: {
        include: {
          course: { include: { schoolRel: true } },
          actualTeacher: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: { originalDate: "asc" as const },
  },
  events: { orderBy: { createdAt: "asc" as const } },
} satisfies Prisma.CourseChangeRequestInclude;

export function parseChangeTypes(value: unknown): CourseChangeType[] {
  const raw: unknown[] = Array.isArray(value) ? value : (() => {
    try { return JSON.parse(String(value ?? "[]")); } catch { return []; }
  })();
  const normalized = new Set(raw.map((item) => String(item)));
  return COURSE_CHANGE_TYPES.filter((item) => normalized.has(item));
}

export function splitTimeRange(value: string | null | undefined) {
  const normalized = String(value ?? "")
    .replace(/[－–—～~]/g, "-")
    .replace(/至|到/g, "-")
    .replace(/：/g, ":")
    .replace(/\s+/g, "");
  const [start = "", end = ""] = normalized.split("-");
  return { start, end };
}

export function timeRange(start: unknown, end: unknown) {
  const from = String(start ?? "").trim();
  const to = String(end ?? "").trim();
  return from && to ? `${from}-${to}` : "";
}

export function attendanceHasCompletionData(attendance: {
  reportContent?: string | null;
  reportSentAt?: Date | null;
  schoolNotifiedAt?: Date | null;
  studentCount?: number | null;
  studentCountA?: number | null;
  studentCountB?: number | null;
}) {
  return Boolean(String(attendance.reportContent ?? "").trim())
    || Boolean(attendance.reportSentAt)
    || Boolean(attendance.schoolNotifiedAt)
    || attendance.studentCount != null
    || attendance.studentCountA != null
    || attendance.studentCountB != null;
}

function currentSchedule(attendance: {
  date: Date;
  scheduledTime?: string | null;
  scheduledSchoolId?: number | null;
  scheduledSchoolName?: string | null;
  scheduledAddress?: string | null;
  scheduledLocation?: string | null;
  course: { time: string; schoolId: number | null; school: string; address: string; location: string; schoolRel?: { address: string } | null };
}) {
  const time = String(attendance.scheduledTime ?? "").trim() || attendance.course.time;
  return {
    date: attendance.date,
    time,
    schoolId: attendance.scheduledSchoolId ?? attendance.course.schoolId,
    schoolName: String(attendance.scheduledSchoolName ?? "").trim() || attendance.course.school,
    address: String(attendance.scheduledAddress ?? "").trim() || attendance.course.address || attendance.course.schoolRel?.address || "",
    location: String(attendance.scheduledLocation ?? "").trim() || attendance.course.location || "",
  };
}

export async function addCourseChangeEvent(db: DbClient, input: {
  requestId: number;
  actorType: string;
  actorId?: number | null;
  actorName?: string;
  action: string;
  fromStatus?: string;
  toStatus?: string;
  note?: string;
  beforeData?: unknown;
  afterData?: unknown;
}) {
  return db.courseChangeRequestEvent.create({
    data: {
      requestId: input.requestId,
      actorType: input.actorType,
      actorId: input.actorId ?? null,
      actorName: input.actorName ?? "",
      action: input.action,
      fromStatus: input.fromStatus ?? "",
      toStatus: input.toStatus ?? "",
      note: input.note ?? "",
      beforeData: input.beforeData === undefined ? "" : JSON.stringify(input.beforeData),
      afterData: input.afterData === undefined ? "" : JSON.stringify(input.afterData),
    },
  });
}

export type CreateCourseChangeInput = {
  attendanceIds: number[];
  requestSource: "ADMIN" | "SCHOOL";
  requestedByUserId?: number | null;
  requestedBySchoolId?: number | null;
  requestedByName: string;
  changeScope?: "SINGLE" | "SELECTED" | "FUTURE_SERIES";
  changeTypes: unknown;
  newDate?: string;
  newStartTime?: string;
  newEndTime?: string;
  newSchoolId?: number | null;
  newSchoolName?: string;
  newAddress?: string;
  newLocation?: string;
  newStudentCount?: number | null;
  reasonType: string;
  reasonNote?: string;
};

export async function createCourseChangeRequest(input: CreateCourseChangeInput) {
  const attendanceIds = [...new Set(input.attendanceIds.map(Number).filter(Number.isFinite))];
  if (attendanceIds.length === 0) throw new Error("請選擇要異動的課程");
  const changeTypes = parseChangeTypes(input.changeTypes);
  if (changeTypes.length === 0) throw new Error("請至少選擇一種異動類型");
  if (!COURSE_CHANGE_REASONS.includes(input.reasonType as (typeof COURSE_CHANGE_REASONS)[number])) throw new Error("請選擇異動原因");
  if (input.reasonType === "其他" && !String(input.reasonNote ?? "").trim()) throw new Error("請填寫其他異動原因");
  if (changeTypes.includes("DATE") && attendanceIds.length !== 1) throw new Error("日期異動第一版僅支援單堂課程");
  if (changeTypes.includes("DATE") && !/^\d{4}-\d{2}-\d{2}$/.test(String(input.newDate ?? ""))) throw new Error("請填寫新日期");
  if (changeTypes.includes("TIME") && !timeRange(input.newStartTime, input.newEndTime)) throw new Error("請填寫新的開始與結束時間");
  if (changeTypes.includes("LOCATION") && !input.newSchoolId && !String(input.newSchoolName ?? "").trim() && !String(input.newLocation ?? "").trim()) {
    throw new Error("請選擇新園所或填寫新上課地點");
  }
  if (changeTypes.includes("CANCEL") && changeTypes.length > 1) throw new Error("停課申請不可與其他異動類型同時選取");
  const newStudentCount = input.newStudentCount == null || input.newStudentCount === ("" as never)
    ? null
    : Number(input.newStudentCount);
  if (changeTypes.includes("STUDENT_COUNT")) {
    if (newStudentCount == null || !Number.isInteger(newStudentCount) || newStudentCount < 0) throw new Error("請填寫調整後的人數");
  }

  const attendances = await prisma.attendance.findMany({
    where: { id: { in: attendanceIds } },
    include: { course: { include: { schoolRel: true } }, actualTeacher: true },
    orderBy: { date: "asc" },
  });
  if (attendances.length !== attendanceIds.length) throw new Error("部分課程已不存在，請重新選擇");
  const courseIds = new Set(attendances.map((item) => item.courseId));
  if (courseIds.size !== 1) throw new Error("指定日期必須屬於同一門課程");
  for (const attendance of attendances) {
    if (attendance.cancelled) throw new Error("已停課的課程不可申請異動");
    if (attendance.isPayrollLocked) throw new Error("已鎖定薪資的課程不可申請異動");
    if (attendanceHasCompletionData(attendance)) throw new Error("已完成或已回報的課程不可申請異動");
  }

  const first = attendances[0];
  const firstSchedule = currentSchedule(first);
  if (input.requestSource === "SCHOOL" && input.requestedBySchoolId !== firstSchedule.schoolId && input.requestedBySchoolId !== first.course.schoolId) {
    throw new Error("不可申請其他園所的課程異動");
  }
  const activeDuplicate = await prisma.courseChangeRequestTarget.findFirst({
    where: {
      attendanceId: { in: attendanceIds },
      request: { status: { notIn: [COURSE_CHANGE_STATUS.completed, COURSE_CHANGE_STATUS.cancelled] } },
    },
  });
  if (activeDuplicate) throw new Error("選取的課程已有尚未完成的異動申請");

  const selectedSchool = input.newSchoolId
    ? await prisma.school.findUnique({ where: { id: Number(input.newSchoolId) } })
    : null;
  if (input.newSchoolId && !selectedSchool) throw new Error("找不到選取的新園所");
  const originalTime = splitTimeRange(firstSchedule.time);
  const requestStatus = input.requestSource === "SCHOOL" ? COURSE_CHANGE_STATUS.pendingReview : COURSE_CHANGE_STATUS.pendingReview;

  return prisma.$transaction(async (tx) => {
    const request = await tx.courseChangeRequest.create({
      data: {
        courseId: first.courseId,
        teacherId: first.actualTeacherId,
        primaryAttendanceId: first.id,
        requestSource: input.requestSource,
        requestedByUserId: input.requestedByUserId ?? null,
        requestedBySchoolId: input.requestedBySchoolId ?? null,
        requestedByName: input.requestedByName,
        changeScope: input.changeScope === "SELECTED" ? "SELECTED" : "SINGLE",
        changeTypes: JSON.stringify(changeTypes),
        originalDate: first.date,
        newDate: changeTypes.includes("DATE") ? parseAttendanceDay(String(input.newDate)) : null,
        originalStartTime: originalTime.start,
        originalEndTime: originalTime.end,
        newStartTime: changeTypes.includes("TIME") ? String(input.newStartTime ?? "") : "",
        newEndTime: changeTypes.includes("TIME") ? String(input.newEndTime ?? "") : "",
        originalSchoolId: firstSchedule.schoolId,
        newSchoolId: selectedSchool?.id ?? (input.newSchoolId ? Number(input.newSchoolId) : null),
        originalSchoolName: firstSchedule.schoolName,
        newSchoolName: selectedSchool?.name ?? String(input.newSchoolName ?? ""),
        originalAddress: firstSchedule.address,
        newAddress: selectedSchool?.address ?? String(input.newAddress ?? ""),
        originalLocation: firstSchedule.location,
        newLocation: String(input.newLocation ?? ""),
        newStudentCount: changeTypes.includes("STUDENT_COUNT") ? newStudentCount : null,
        reasonType: input.reasonType,
        reasonNote: String(input.reasonNote ?? ""),
        status: requestStatus,
        targets: {
          create: attendances.map((attendance) => {
            const schedule = currentSchedule(attendance);
            return {
              attendanceId: attendance.id,
              originalDate: attendance.date,
              originalTime: schedule.time,
              originalSchoolId: schedule.schoolId,
              originalSchoolName: schedule.schoolName,
              originalAddress: schedule.address,
              originalLocation: schedule.location,
            };
          }),
        },
      },
    });
    await addCourseChangeEvent(tx, {
      requestId: request.id,
      actorType: input.requestSource === "SCHOOL" ? "school" : "admin",
      actorId: input.requestSource === "SCHOOL" ? input.requestedBySchoolId : input.requestedByUserId,
      actorName: input.requestedByName,
      action: "建立異動申請",
      toStatus: requestStatus,
      afterData: request,
    });
    return tx.courseChangeRequest.findUniqueOrThrow({ where: { id: request.id }, include: courseChangeInclude });
  });
}

export async function getCourseChangeRequest(id: number) {
  return prisma.courseChangeRequest.findUnique({ where: { id }, include: courseChangeInclude });
}

export async function respondToCourseChange(requestId: number, teacherId: number, response: "AVAILABLE" | "UNAVAILABLE" | "DISCUSS", teacherName: string) {
  const request = await prisma.courseChangeRequest.findUnique({ where: { id: requestId } });
  if (!request) throw new Error("找不到這筆課程異動");
  if (request.teacherId !== teacherId) throw new Error("這筆課程異動不是發送給您的");
  if (request.status !== COURSE_CHANGE_STATUS.pendingTeacher) {
    if (request.teacherResponse === response) return getCourseChangeRequest(requestId);
    throw new Error("這筆課程異動已經處理，請聯絡行政確認");
  }
  const status = response === "AVAILABLE"
    ? COURSE_CHANGE_STATUS.teacherAvailable
    : response === "UNAVAILABLE"
      ? COURSE_CHANGE_STATUS.teacherUnavailable
      : COURSE_CHANGE_STATUS.discuss;
  return prisma.$transaction(async (tx) => {
    const updated = await tx.courseChangeRequest.update({
      where: { id: requestId },
      data: { status, teacherResponse: response, teacherRespondedAt: new Date() },
    });
    await addCourseChangeEvent(tx, {
      requestId,
      actorType: "teacher",
      actorId: teacherId,
      actorName: teacherName,
      action: "老師回覆異動",
      fromStatus: request.status,
      toStatus: status,
      note: response,
    });
    return tx.courseChangeRequest.findUniqueOrThrow({ where: { id: updated.id }, include: courseChangeInclude });
  });
}

export async function applyCourseChangeRequest(requestId: number, actor: { userId: number | null; name: string }) {
  return prisma.$transaction(async (tx) => {
    const request = await tx.courseChangeRequest.findUnique({ where: { id: requestId }, include: courseChangeInclude });
    if (!request) throw new Error("找不到這筆課程異動");
    if (request.status !== COURSE_CHANGE_STATUS.teacherAvailable) throw new Error("老師尚未回覆可以配合，不能套用異動");
    const changeTypes = parseChangeTypes(request.changeTypes);
    if (request.targets.length === 0) throw new Error("這筆異動沒有指定課程");
    if (changeTypes.includes("DATE") && request.targets.length !== 1) throw new Error("日期異動只能套用至單堂課程");

    for (const target of request.targets) {
      const attendance = target.attendance;
      if (attendance.cancelled) throw new Error("課程已停課，不能套用異動");
      if (attendance.isPayrollLocked) throw new Error("課程已鎖定薪資，不能套用異動");
      if (attendanceHasCompletionData(attendance)) throw new Error("課程已完成或已回報，不能套用異動");
      const current = currentSchedule(attendance);
      if (current.date.toISOString().slice(0, 10) !== target.originalDate.toISOString().slice(0, 10)
        || current.time !== target.originalTime
        || current.schoolName !== target.originalSchoolName
        || current.address !== target.originalAddress
        || current.location !== target.originalLocation) {
        throw new Error("正式課表已被其他人修改，請取消此申請後重新建立");
      }
    }

    if (changeTypes.includes("DATE") && request.newDate) {
      const target = request.targets[0];
      const conflict = await tx.attendance.findFirst({
        where: { courseId: request.courseId, date: request.newDate, id: { not: target.attendanceId } },
      });
      if (conflict) throw new Error("新日期已有同一門課程，請選擇其他日期");
    }

    for (const target of request.targets) {
      const attendance = target.attendance;
      if (changeTypes.includes("CANCEL")) {
        await tx.attendance.update({
          where: { id: target.attendanceId },
          data: {
            cancelled: true,
            cancelReason: [request.reasonType, request.reasonNote].filter(Boolean).join("：") || "園所申請停課",
          },
        });
        continue;
      }
      const nextTime = changeTypes.includes("TIME")
        ? timeRange(request.newStartTime, request.newEndTime)
        : target.originalTime;
      const calculated = coursePayrollHoursForAttendance(attendance.course.payrollHours, nextTime);
      const studentCountNote = changeTypes.includes("STUDENT_COUNT") && request.newStudentCount != null
        ? `【人數異動】調整後人數 ${request.newStudentCount} 人（${new Date().toISOString().slice(0, 10)} 套用）`
        : "";
      await tx.attendance.update({
        where: { id: target.attendanceId },
        data: {
          notes: studentCountNote
            ? [attendance.notes, studentCountNote].filter(Boolean).join("\n")
            : undefined,
          date: changeTypes.includes("DATE") && request.newDate ? request.newDate : undefined,
          scheduledTime: changeTypes.includes("TIME") ? nextTime : undefined,
          hours: changeTypes.includes("TIME") ? calculated.hours : undefined,
          scheduledSchoolId: changeTypes.includes("LOCATION") && request.newSchoolId ? request.newSchoolId : undefined,
          scheduledSchoolName: changeTypes.includes("LOCATION") && request.newSchoolName ? request.newSchoolName : undefined,
          scheduledAddress: changeTypes.includes("LOCATION") && (request.newSchoolId || request.newSchoolName)
            ? request.newAddress || "地址待確認"
            : undefined,
          scheduledLocation: changeTypes.includes("LOCATION")
            ? request.newLocation || (request.newSchoolId || request.newSchoolName ? "地點待確認" : undefined)
            : undefined,
        },
      });
    }

    const completed = await tx.courseChangeRequest.update({
      where: { id: request.id },
      data: {
        status: COURSE_CHANGE_STATUS.completed,
        reviewedByUserId: actor.userId,
        reviewedByName: actor.name,
        reviewedAt: new Date(),
        appliedByUserId: actor.userId,
        appliedByName: actor.name,
        appliedAt: new Date(),
      },
    });
    await addCourseChangeEvent(tx, {
      requestId: request.id,
      actorType: "admin",
      actorId: actor.userId,
      actorName: actor.name,
      action: "確認並套用異動",
      fromStatus: request.status,
      toStatus: COURSE_CHANGE_STATUS.completed,
      beforeData: request.targets.map((target) => ({ attendanceId: target.attendanceId, date: target.originalDate, time: target.originalTime })),
      afterData: completed,
    });
    return tx.courseChangeRequest.findUniqueOrThrow({ where: { id: request.id }, include: courseChangeInclude });
  });
}

export function courseChangeDisplay(request: Awaited<ReturnType<typeof getCourseChangeRequest>>) {
  if (!request) return null;
  return { ...request, changeTypes: parseChangeTypes(request.changeTypes) };
}
