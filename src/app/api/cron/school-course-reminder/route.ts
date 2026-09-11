import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { taipeiDateIso } from "@/lib/courseDates";
import { dayBounds } from "@/lib/scheduleLogic";
import { isWaitingTeacherName } from "@/lib/teacherAssignment";
import { notifySchoolUpcomingCourses, type UpcomingSchoolCourse } from "@/lib/schoolNotification";
import { recordAutomationRun } from "@/lib/automationHealth";

function addIsoDays(iso: string, days: number) {
  const date = new Date(`${iso}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const targetDate = addIsoDays(taipeiDateIso(), 2);
  const { start, end } = dayBounds(targetDate);
  const [attendances, schools] = await Promise.all([
    prisma.attendance.findMany({
      where: { date: { gte: start, lt: end }, cancelled: false, course: { isActive: true } },
      include: {
        course: true,
        actualTeacher: { select: { name: true } },
        assistantTeacher: { select: { name: true } },
      },
      orderBy: [{ scheduledTime: "asc" }, { id: "asc" }],
    }),
    prisma.school.findMany({ select: { id: true, name: true } }),
  ]);
  const schoolIdByName = new Map(schools.map((school) => [school.name.trim(), school.id]));
  const grouped = new Map<number, UpcomingSchoolCourse[]>();
  for (const attendance of attendances) {
    const schoolName = attendance.scheduledSchoolName.trim() || attendance.course.school.trim();
    const schoolId = attendance.scheduledSchoolId ?? attendance.course.schoolId ?? schoolIdByName.get(schoolName);
    if (!schoolId) continue;
    const rows = grouped.get(schoolId) ?? [];
    rows.push({
      attendanceId: attendance.id,
      time: attendance.scheduledTime?.trim() || attendance.course.time || "時間待確認",
      courseType: attendance.course.courseType,
      teacherName: isWaitingTeacherName(attendance.actualTeacher.name) ? "師資確認中" : attendance.actualTeacher.name,
      assistantTeacherName: attendance.assistantTeacher && !isWaitingTeacherName(attendance.assistantTeacher.name)
        ? attendance.assistantTeacher.name
        : undefined,
    });
    grouped.set(schoolId, rows);
  }

  let sent = 0;
  let skipped = 0;
  const failures: string[] = [];
  for (const [schoolId, courses] of grouped) {
    const result = await notifySchoolUpcomingCourses({ schoolId, targetDate, courses });
    if (result.status === "通知成功") sent += 1;
    else if (result.status === "不需通知") skipped += 1;
    else failures.push(`園所 #${schoolId}：${result.error || "發送失敗"}`);
  }
  const status = failures.length === 0 ? "success" : sent > 0 ? "partial" : "failed";
  await recordAutomationRun({
    jobKey: "school-course-reminder",
    targetDate,
    status,
    total: grouped.size,
    success: sent,
    failed: failures.length,
    details: `略過 ${skipped}；${failures.join("；")}`,
  });
  return NextResponse.json({ ok: failures.length === 0, targetDate, schools: grouped.size, sent, skipped, failures });
}
