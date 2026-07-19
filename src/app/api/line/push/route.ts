import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLineConfig, pushMessage, buildReminderMessage, buildReportRequestMessage } from "@/lib/line";
import type { LineRegion } from "@/lib/line";
import { courseDateWindowWhere, courseIdsWithAnyAttendance, dayBounds, dayNameOfIso } from "@/lib/scheduleLogic";
import { attendanceScheduledTimeMap, effectiveAttendanceTime, stampAttendanceTime } from "@/lib/attendanceTime";
import { createAttendancesForUniqueDays } from "@/lib/attendanceBatch";
import { attendanceHoursFromCourseTime } from "@/lib/courseHours";
import { isPendingReport } from "@/lib/reportWindow";
import { taipeiDateIso } from "@/lib/courseDates";
import { courseConfirmationMapBySchoolIds, courseConfirmationSummary } from "@/lib/courseConfirmation";
import { NOTIFY_ROLES, requireRole, sameOriginOk } from "@/lib/permissions";
import { writeAuditLog } from "@/lib/auditLog";

function addIsoDays(iso: string, days: number) {
  const date = new Date(`${iso}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

type ReminderTeacher = { id: number; name: string; lineUserId: string | null; lineRegion: string };
type ReminderCourse = { attendanceId?: number; school: string; time: string; courseType: string; address?: string; date: string; dayOfWeek: string; confirmationSummary?: string };

// POST /api/line/push
// body: { type: "reminder" | "report_request", teacherId?, teacherName?, date?, dayOffset?, attendanceId? }
export async function POST(req: NextRequest) {
  // 路由層權限驗證（不依賴 middleware）＋ same-origin 檢查
  const { user, response } = await requireRole(NOTIFY_ROLES);
  if (response) return response;
  if (!sameOriginOk(req)) return NextResponse.json({ error: "來源不合法" }, { status: 403 });

  const body = await req.json();
  await writeAuditLog(req, {
    actorName: user?.name, actorRole: user?.role, actorUserId: user?.userId ?? undefined,
    action: "line_push", targetType: "Line", targetLabel: String(body?.type ?? ""),
    diffSummary: `LINE 發送：type=${String(body?.type ?? "")}${body?.dayOffset != null ? `，dayOffset=${body.dayOffset}` : ""}${body?.attendanceId ? `，attendanceId=${body.attendanceId}` : ""}`,
  });

  if (body.type === "reminder") {
    // Send class/report reminders to all teachers (or a specific teacher).
    // Default is today in Taiwan; dayOffset=1 sends tomorrow's classes.
    const dayOffset = Number(body.dayOffset ?? 0);
    const dateStr = body.date ? String(body.date).slice(0, 10) : addIsoDays(taipeiDateIso(), Number.isFinite(dayOffset) ? dayOffset : 0);
    const targetDate = new Date(`${dateStr}T00:00:00.000Z`);
    const dayName = dayNameOfIso(dateStr);
    const { start, end } = dayBounds(dateStr);
    let targetTeacherId = body.teacherId ? Number(body.teacherId) : null;
    const targetTeacherName = String(body.teacherName ?? "").trim();
    if (!targetTeacherId && targetTeacherName) {
      const teacher = await prisma.teacher.findFirst({
        where: { name: { contains: targetTeacherName } },
        select: { id: true },
      });
      if (!teacher) return NextResponse.json({ error: `找不到老師：${targetTeacherName}` }, { status: 404 });
      targetTeacherId = teacher.id;
    }
    const courseTeacherFilter = targetTeacherId ? { OR: [{ teacherId: targetTeacherId }, { assistantTeacherId: targetTeacherId }] } : {};
    const targetCourseWindow = courseDateWindowWhere(dateStr);
    const datedCourseIds = await courseIdsWithAnyAttendance({ isActive: true, ...targetCourseWindow, ...courseTeacherFilter }, targetDate);

    const [scheduledAttendances, weekdayCourses] = await Promise.all([
      prisma.attendance.findMany({
        where: {
          cancelled: false,
          date: { gte: start, lt: end },
          ...(targetTeacherId ? { OR: [{ actualTeacherId: targetTeacherId }, { assistantTeacherId: targetTeacherId }] } : {}),
          course: { isActive: true, ...targetCourseWindow },
        },
        include: { course: { include: { schoolRel: true } }, actualTeacher: true, assistantTeacher: true },
      }),
      prisma.course.findMany({
        where: {
          isActive: true,
          ...targetCourseWindow,
          dayOfWeek: dayName,
          ...courseTeacherFilter,
          ...(datedCourseIds.size > 0 ? { id: { notIn: [...datedCourseIds] } } : {}),
        },
        include: { teacher: true, assistantTeacher: true, schoolRel: true },
      }),
    ]);
    const scheduledTimeMap = await attendanceScheduledTimeMap(scheduledAttendances.map((attendance) => attendance.id));
    const confirmationMap = await courseConfirmationMapBySchoolIds([
      ...scheduledAttendances.map((att) => att.course.schoolId ?? 0),
      ...weekdayCourses.map((course) => course.schoolId ?? 0),
    ]);
    const confirmationSummaryFor = (schoolId?: number | null) => schoolId
      ? courseConfirmationSummary(confirmationMap.get(schoolId), { multiline: true, teacher: true })
      : "";

    const grouped = new Map<number, { teacher: ReminderTeacher; courses: ReminderCourse[] }>();
    const addCourse = (teacher: ReminderTeacher | null | undefined, course: { attendanceId?: number; school: string; time: string; courseType: string; address?: string; confirmationSummary?: string }) => {
      if (!teacher) return;
      const item = grouped.get(teacher.id) ?? { teacher, courses: [] };
      item.courses.push({ ...course, date: dateStr, dayOfWeek: dayName });
      grouped.set(teacher.id, item);
    };
    for (const att of scheduledAttendances) {
      const time = effectiveAttendanceTime({
        scheduledTime: scheduledTimeMap.get(att.id),
        courseTime: att.course.time,
        attendanceHours: att.hours,
        isPayrollLocked: att.isPayrollLocked,
        reportContent: att.reportContent,
        reportSentAt: att.reportSentAt,
        studentCount: att.studentCount,
        studentCountA: att.studentCountA,
        studentCountB: att.studentCountB,
      });
      addCourse(att.actualTeacher, { attendanceId: att.id, school: att.course.school, time, courseType: att.course.courseType, address: att.course.address || att.course.schoolRel?.address || "", confirmationSummary: confirmationSummaryFor(att.course.schoolId) });
      if (att.assistantTeacher?.id !== att.actualTeacher.id) {
        addCourse(att.assistantTeacher, { attendanceId: att.id, school: att.course.school, time, courseType: att.course.courseType, address: att.course.address || att.course.schoolRel?.address || "", confirmationSummary: confirmationSummaryFor(att.course.schoolId) });
      }
    }
    for (const course of weekdayCourses) {
      const calculated = attendanceHoursFromCourseTime(course.time || "");
      const result = await createAttendancesForUniqueDays([dateStr], {
        courseId: course.id, actualTeacherId: course.teacherId, assistantTeacherId: course.assistantTeacherId,
        category: course.category, hours: calculated.hours,
        notes: calculated.needsReview ? `上課時間需人工確認：${calculated.reason}` : "",
      });
      const attendance = result.records[0] ?? await prisma.attendance.findFirst({ where: { courseId: course.id, date: { gte: start, lt: end } } });
      await stampAttendanceTime(course.id, [dateStr], course.time || "").catch(() => undefined);
      addCourse(course.teacher, { attendanceId: attendance?.id, school: course.school, time: course.time, courseType: course.courseType, address: course.address || course.schoolRel?.address || "", confirmationSummary: confirmationSummaryFor(course.schoolId) });
      if (course.assistantTeacher?.id !== course.teacher.id) {
        addCourse(course.assistantTeacher, { attendanceId: attendance?.id, school: course.school, time: course.time, courseType: course.courseType, address: course.address || course.schoolRel?.address || "", confirmationSummary: confirmationSummaryFor(course.schoolId) });
      }
    }

    let sent = 0, skipped = 0, failed = 0;
    const errors: string[] = [];
    for (const { teacher, courses } of grouped.values()) {
      if (!teacher.lineUserId || !teacher.lineRegion) { skipped++; continue; }
      const cfg = getLineConfig(teacher.lineRegion as LineRegion);
      const msg = buildReminderMessage({
        teacherName: teacher.name,
        title: dayOffset === 1 && !body.date ? "明日課程提醒" : "課程提醒",
        courses,
      });
      try {
        await pushMessage(teacher.lineUserId, [msg], cfg.token);
        sent++;
      } catch (error) {
        failed++;
        errors.push(`${teacher.name}：${(error as Error).message}`);
      }
    }

    return NextResponse.json({ ok: failed === 0, sent, skipped, failed, errors: errors.slice(0, 5) });
  }

  if (body.type === "report_request") {
    // Send report request for a specific attendance record
    const att = await prisma.attendance.findUnique({
      where: { id: Number(body.attendanceId) },
      include: { course: true, actualTeacher: true },
    });
    if (!att) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const scheduledTimeMap = await attendanceScheduledTimeMap([att.id]);
    const time = effectiveAttendanceTime({
      scheduledTime: scheduledTimeMap.get(att.id),
      courseTime: att.course.time,
      attendanceHours: att.hours,
      isPayrollLocked: att.isPayrollLocked,
      reportContent: att.reportContent,
      reportSentAt: att.reportSentAt,
      studentCount: att.studentCount,
      studentCountA: att.studentCountA,
      studentCountB: att.studentCountB,
    });
    if (!isPendingReport(att, time)) {
      return NextResponse.json({ error: "此課程已完成回報或不在回報期限內" }, { status: 409 });
    }

    const teacher = att.actualTeacher;
    if (!teacher.lineUserId || !teacher.lineRegion) {
      return NextResponse.json({ error: "Teacher has no LINE binding" }, { status: 400 });
    }

    const cfg = getLineConfig(teacher.lineRegion as LineRegion);
    const msg = buildReportRequestMessage({
      school: att.course.school,
      courseType: att.course.courseType,
      attendanceId: att.id,
    });
    try {
      await pushMessage(teacher.lineUserId, [msg], cfg.token);
    } catch (error) {
      return NextResponse.json({ error: (error as Error).message || "LINE 發送失敗" }, { status: 502 });
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown type" }, { status: 400 });
}
