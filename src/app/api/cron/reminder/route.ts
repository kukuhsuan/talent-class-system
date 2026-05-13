import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { pushMessage, buildReminderMessage } from "@/lib/line";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowName = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"][tomorrow.getDay()];
  const tomorrowStr = tomorrow.toLocaleDateString("zh-TW", { month: "long", day: "numeric", weekday: "long" });

  const y = tomorrow.getFullYear();
  const m = tomorrow.getMonth();
  const d = tomorrow.getDate();
  const dayStart = new Date(y, m, d);
  const dayEnd = new Date(y, m, d + 1);

  const attTomorrow = await prisma.attendance.findMany({
    where: { date: { gte: dayStart, lt: dayEnd } },
    select: { courseId: true },
  });
  const idsFromSchedule = [...new Set(attTomorrow.map((a) => a.courseId))];

  const [byWeekday, bySchedule] = await Promise.all([
    prisma.course.findMany({
      where: { isActive: true, dayOfWeek: tomorrowName },
      include: { teacher: true },
    }),
    idsFromSchedule.length
      ? prisma.course.findMany({
          where: { isActive: true, id: { in: idsFromSchedule } },
          include: { teacher: true },
        })
      : Promise.resolve([]),
  ]);

  const merged = new Map<number, (typeof byWeekday)[number]>();
  for (const c of byWeekday) merged.set(c.id, c);
  for (const c of bySchedule) merged.set(c.id, c);
  const courses = [...merged.values()];

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

    const region = teacher.lineRegion || "north";
    const token = region === "south"
      ? process.env.LINE_SOUTH_TOKEN!
      : process.env.LINE_NORTH_TOKEN!;

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
