import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLineConfig, pushMessage, buildReminderMessage } from "@/lib/line";
import type { LineRegion } from "@/lib/line";
import { courseDateWindowWhere, courseIdsWithAnyAttendance, dayBounds, dayNameOfIso } from "@/lib/scheduleLogic";
import { attendanceScheduledTimeMap, effectiveAttendanceTime, stampAttendanceTime } from "@/lib/attendanceTime";
import { createAttendancesForUniqueDays } from "@/lib/attendanceBatch";
import { attendanceHoursFromCourseTime } from "@/lib/courseHours";
import { taipeiDateIso } from "@/lib/courseDates";
import { courseConfirmationMapBySchoolIds, courseConfirmationSummary } from "@/lib/courseConfirmation";
import { equipmentByAttendanceIds } from "@/lib/equipmentReminder";
import type { EquipmentReminderData } from "@/lib/equipmentReminderCore";

type ReminderTeacher = { id: number; name: string; lineUserId: string | null; lineRegion: string };
type ReminderCourse = { attendanceId?: number; school: string; time: string; courseType: string; address?: string; date: string; dayOfWeek: string; confirmationSummary?: string; equipment?: EquipmentReminderData | null };

function addIsoDays(iso: string, days: number) {
  const date = new Date(`${iso}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function ensureCourseReminderDeliveryTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS CourseReminderDelivery (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      teacherId INTEGER NOT NULL,
      targetDate TEXT NOT NULL,
      dayOffset INTEGER NOT NULL DEFAULT 0,
      sentAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(teacherId, targetDate, dayOffset)
    )
  `);
}

async function wasCourseReminderSent(teacherId: number, targetDate: string, dayOffset: number) {
  const rows = await prisma.$queryRawUnsafe<Array<{ id: number }>>(
    "SELECT id FROM CourseReminderDelivery WHERE teacherId = ? AND targetDate = ? AND dayOffset = ? LIMIT 1",
    teacherId,
    targetDate,
    dayOffset,
  );
  return rows.length > 0;
}

async function markCourseReminderSent(teacherId: number, targetDate: string, dayOffset: number) {
  await prisma.$executeRawUnsafe(
    "INSERT OR IGNORE INTO CourseReminderDelivery (teacherId, targetDate, dayOffset) VALUES (?, ?, ?)",
    teacherId,
    targetDate,
    dayOffset,
  );
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const querySecret = req.nextUrl.searchParams.get("secret");
  if (!process.env.CRON_SECRET || (authHeader !== `Bearer ${process.env.CRON_SECRET}` && querySecret !== process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await ensureCourseReminderDeliveryTable();

  const dayOffsetRaw = Number(req.nextUrl.searchParams.get("dayOffset") ?? "0");
  const dayOffset = Number.isFinite(dayOffsetRaw) ? Math.max(0, Math.min(1, dayOffsetRaw)) : 0;
  const targetIso = addIsoDays(taipeiDateIso(), dayOffset);
  const targetDate = new Date(`${targetIso}T00:00:00.000Z`);
  const targetName = dayNameOfIso(targetIso);
  const { start: dayStart, end: dayEnd } = dayBounds(targetIso);
  const targetCourseWindow = courseDateWindowWhere(targetIso);
  const datedCourseIds = await courseIdsWithAnyAttendance({ isActive: true, ...targetCourseWindow }, targetDate);

  const [bySchedule, byWeekday] = await Promise.all([
    prisma.attendance.findMany({
      where: {
        cancelled: false,
        date: { gte: dayStart, lt: dayEnd },
        course: { isActive: true, ...targetCourseWindow },
      },
      include: { course: { include: { schoolRel: true } }, actualTeacher: true, assistantTeacher: true },
    }),
    prisma.course.findMany({
      where: {
        isActive: true,
        ...targetCourseWindow,
        dayOfWeek: targetName,
        ...(datedCourseIds.size > 0 ? { id: { notIn: [...datedCourseIds] } } : {}),
      },
      include: { teacher: true, assistantTeacher: true, schoolRel: true },
    }),
  ]);
  const scheduledTimeMap = await attendanceScheduledTimeMap(bySchedule.map((attendance) => attendance.id));
  const confirmationMap = await courseConfirmationMapBySchoolIds([
    ...bySchedule.map((att) => att.course.schoolId ?? 0),
    ...byWeekday.map((course) => course.schoolId ?? 0),
  ]);
  const confirmationSummaryFor = (schoolId?: number | null) => schoolId
    ? courseConfirmationSummary(confirmationMap.get(schoolId), { multiline: true, teacher: true })
    : "";
  const weekdayWithAttendance = await Promise.all(byWeekday.map(async (course) => {
    const calculated = attendanceHoursFromCourseTime(course.time || "");
    const result = await createAttendancesForUniqueDays([targetIso], {
      courseId: course.id, actualTeacherId: course.teacherId, assistantTeacherId: course.assistantTeacherId,
      category: course.category, hours: calculated.hours,
      notes: calculated.needsReview ? `上課時間需人工確認：${calculated.reason}` : "",
    });
    const attendance = result.records[0] ?? await prisma.attendance.findFirst({ where: { courseId: course.id, date: { gte: dayStart, lt: dayEnd } } });
    await stampAttendanceTime(course.id, [targetIso], course.time || "").catch(() => undefined);
    return { ...course, attendanceId: attendance?.id };
  }));

  const courses = [
    ...bySchedule.map((att) => ({
      attendanceId: att.id,
      school: att.course.school,
      address: att.course.address || att.course.schoolRel?.address || "",
      time: effectiveAttendanceTime({
        scheduledTime: scheduledTimeMap.get(att.id),
        courseTime: att.course.time,
        attendanceHours: att.hours,
        isPayrollLocked: att.isPayrollLocked,
        reportContent: att.reportContent,
        reportSentAt: att.reportSentAt,
        studentCount: att.studentCount,
        studentCountA: att.studentCountA,
        studentCountB: att.studentCountB,
      }),
      courseType: att.course.courseType,
      confirmationSummary: confirmationSummaryFor(att.course.schoolId),
      teachers: [att.actualTeacher, ...(att.assistantTeacher && att.assistantTeacher.id !== att.actualTeacher.id ? [att.assistantTeacher] : [])],
    })),
    ...weekdayWithAttendance.map((course) => ({
      attendanceId: course.attendanceId,
      school: course.school,
      address: course.address || course.schoolRel?.address || "",
      time: course.time,
      courseType: course.courseType,
      confirmationSummary: confirmationSummaryFor(course.schoolId),
      teachers: [course.teacher, ...(course.assistantTeacher && course.assistantTeacher.id !== course.teacher.id ? [course.assistantTeacher] : [])],
    })),
  ];

  if (courses.length === 0) {
    return NextResponse.json({ sent: 0, message: "no courses today" });
  }

  // 器材提醒：一次撈出所有出勤的設定，附掛到提醒卡片
  const equipmentMap = await equipmentByAttendanceIds(courses.map((course) => course.attendanceId ?? 0));

  const byTeacher = new Map<number, { teacher: ReminderTeacher; courses: ReminderCourse[] }>();
  for (const course of courses) {
    for (const teacher of course.teachers) {
      const item = byTeacher.get(teacher.id) ?? { teacher, courses: [] };
      item.courses.push({
        attendanceId: course.attendanceId,
        school: course.school,
        address: course.address,
        time: course.time,
        courseType: course.courseType,
        date: targetIso,
        dayOfWeek: targetName,
        confirmationSummary: course.confirmationSummary,
        equipment: course.attendanceId ? equipmentMap.get(course.attendanceId) ?? null : null,
      });
      byTeacher.set(teacher.id, item);
    }
  }

  let sent = 0;
  let skippedNoLine = 0;
  let skippedAlreadySent = 0;
  const errors: string[] = [];

  for (const { teacher, courses: teacherCourses } of byTeacher.values()) {
    if (!teacher.lineUserId) {
      skippedNoLine++;
      continue;
    }
    if (await wasCourseReminderSent(teacher.id, targetIso, dayOffset)) {
      skippedAlreadySent++;
      continue;
    }

    const region = (teacher.lineRegion || "north") as LineRegion;
    const token = getLineConfig(region).token;

    const message = buildReminderMessage({
      teacherName: teacher.name,
      title: dayOffset === 1 ? "明日課程提醒" : "今日課程提醒",
      date: targetIso,
      dayOfWeek: targetName,
      courses: teacherCourses,
    });

    try {
      await pushMessage(teacher.lineUserId, [message], token);
      await markCourseReminderSent(teacher.id, targetIso, dayOffset);
      sent++;
    } catch (e) {
      errors.push(`${teacher.name}: ${e}`);
    }
  }

  return NextResponse.json({
    ok: errors.length === 0,
    sent,
    total: byTeacher.size,
    checked: courses.length,
    skippedNoLine,
    skippedAlreadySent,
    dayOffset,
    targetDate: targetIso,
    errors,
  });
}
