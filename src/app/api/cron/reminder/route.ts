import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLineConfig, pushMessage, buildReminderMessage } from "@/lib/line";
import type { LineRegion } from "@/lib/line";
import { courseIdsWithAnyAttendance, dayBounds, dayNameOfIso } from "@/lib/scheduleLogic";
import { formatMonthDay } from "@/lib/courseDates";
import { attendanceScheduledTimeMap } from "@/lib/attendanceTime";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowIso = tomorrow.toISOString().slice(0, 10);
  const tomorrowName = dayNameOfIso(tomorrowIso);
  const tomorrowStr = `${formatMonthDay(tomorrowIso)} ${tomorrowName}`;
  const { start: dayStart, end: dayEnd } = dayBounds(tomorrowIso);
  const datedCourseIds = await courseIdsWithAnyAttendance({ isActive: true }, tomorrow);

  const [bySchedule, byWeekday] = await Promise.all([
    prisma.attendance.findMany({
      where: {
        cancelled: false,
        date: { gte: dayStart, lt: dayEnd },
        course: { isActive: true },
      },
      include: { course: true, actualTeacher: true },
    }),
    prisma.course.findMany({
      where: {
        isActive: true,
        dayOfWeek: tomorrowName,
        ...(datedCourseIds.size > 0 ? { id: { notIn: [...datedCourseIds] } } : {}),
      },
      include: { teacher: true },
    }),
  ]);
  const scheduledTimeMap = await attendanceScheduledTimeMap(bySchedule.map((attendance) => attendance.id));

  const courses = [
    ...bySchedule.map((att) => ({ ...att.course, time: scheduledTimeMap.get(att.id) || att.course.time, teacherId: att.actualTeacher.id, teacher: att.actualTeacher })),
    ...byWeekday,
  ];

  if (courses.length === 0) {
    return NextResponse.json({ sent: 0, message: "no courses tomorrow" });
  }

  // Group by teacher
  const byTeacher = courses.reduce<Record<number, typeof courses>>((acc, c) => {
    if (!acc[c.teacherId]) acc[c.teacherId] = [];
    acc[c.teacherId].push(c);
    return acc;
  }, {});

  let sent = 0;
  const errors: string[] = [];

  for (const [, teacherCourses] of Object.entries(byTeacher)) {
    const teacher = teacherCourses[0].teacher;
    if (!teacher.lineUserId) continue;

    const region = (teacher.lineRegion || "north") as LineRegion;
    const token = getLineConfig(region).token;

    const messages = teacherCourses.map((c) =>
      buildReminderMessage({
        teacherName: teacher.name,
        school: c.school,
        courseType: c.courseType,
        time: c.time,
        date: tomorrowStr,
        dayOfWeek: tomorrowName,
      })
    );

    try {
      await pushMessage(teacher.lineUserId, messages, token);
      sent++;
    } catch (e) {
      errors.push(`${teacher.name}: ${e}`);
    }
  }

  return NextResponse.json({ sent, total: Object.keys(byTeacher).length, errors });
}
