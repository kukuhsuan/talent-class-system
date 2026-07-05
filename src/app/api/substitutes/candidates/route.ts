import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseAttendanceDay } from "@/lib/attendanceBatch";
import { attendanceScheduledTimeMap, effectiveAttendanceTime } from "@/lib/attendanceTime";

export async function GET(req: NextRequest) {
  const school = (req.nextUrl.searchParams.get("school") ?? "").trim();
  const date = (req.nextUrl.searchParams.get("date") ?? "").slice(0, 10);

  if (!school || !date) {
    const rows = await prisma.course.findMany({
      where: { school: { not: "" } },
      select: { school: true },
      distinct: ["school"],
      orderBy: { school: "asc" },
    });
    return NextResponse.json({ schools: rows.map((row) => row.school) });
  }

  const start = parseAttendanceDay(date);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  const attendances = await prisma.attendance.findMany({
    where: { date: { gte: start, lt: end }, cancelled: false, course: { school } },
    include: {
      course: { include: { teacher: true, assistantTeacher: true } },
      actualTeacher: true,
      assistantTeacher: true,
    },
    orderBy: [{ course: { time: "asc" } }, { id: "asc" }],
  });
  const timeMap = await attendanceScheduledTimeMap(attendances.map((row) => row.id));

  return NextResponse.json({
    items: attendances.map((row) => ({
      id: row.id,
      date: row.date,
      time: effectiveAttendanceTime({
        scheduledTime: timeMap.get(row.id),
        courseTime: row.course.time,
        attendanceHours: row.hours,
        isPayrollLocked: row.isPayrollLocked,
        reportContent: row.reportContent,
        reportSentAt: row.reportSentAt,
        studentCount: row.studentCount,
        studentCountA: row.studentCountA,
        studentCountB: row.studentCountB,
      }),
      courseCode: row.course.code,
      courseType: row.course.courseType,
      originalTeacher: row.course.teacher,
      actualTeacher: row.actualTeacher,
      originalAssistantTeacher: row.course.assistantTeacher,
      assistantTeacher: row.assistantTeacher,
      isPayrollLocked: row.isPayrollLocked,
    })),
  });
}
