import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLineConfig, pushMessage, buildReminderMessage, buildReportRequestMessage } from "@/lib/line";
import type { LineRegion } from "@/lib/line";

const DAY_NAMES = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];

// POST /api/line/push
// body: { type: "reminder" | "report_request", teacherId?, date?, attendanceId? }
export async function POST(req: NextRequest) {
  const body = await req.json();

  if (body.type === "reminder") {
    // Send tomorrow's class reminders to all teachers (or specific teacher)
    const targetDate = body.date ? new Date(body.date) : (() => {
      const d = new Date(); d.setDate(d.getDate() + 1); return d;
    })();
    const dayName = DAY_NAMES[targetDate.getDay()];
    const dateStr = targetDate.toISOString().slice(0, 10);

    const courses = await prisma.course.findMany({
      where: { isActive: true, dayOfWeek: dayName, ...(body.teacherId ? { teacherId: Number(body.teacherId) } : {}) },
      include: { teacher: true },
    });

    let sent = 0, skipped = 0;
    for (const course of courses) {
      const teacher = course.teacher;
      if (!teacher.lineUserId || !teacher.lineRegion) { skipped++; continue; }

      const cfg = getLineConfig(teacher.lineRegion as LineRegion);
      const msg = buildReminderMessage({
        teacherName: teacher.name,
        school: course.school,
        courseType: course.courseType,
        time: course.time,
        date: dateStr,
        dayOfWeek: dayName,
      });
      await pushMessage(teacher.lineUserId, [msg], cfg.token);
      sent++;
    }

    return NextResponse.json({ ok: true, sent, skipped });
  }

  if (body.type === "report_request") {
    // Send report request for a specific attendance record
    const att = await prisma.attendance.findUnique({
      where: { id: Number(body.attendanceId) },
      include: { course: true, actualTeacher: true },
    });
    if (!att) return NextResponse.json({ error: "Not found" }, { status: 404 });

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
    await pushMessage(teacher.lineUserId, [msg], cfg.token);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown type" }, { status: 400 });
}
