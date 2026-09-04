import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildReportRequestMessage, getLineConfig, pushMessage } from "@/lib/line";
import type { LineRegion } from "@/lib/line";
import { taipeiDateIso } from "@/lib/courseDates";
import { dayBounds } from "@/lib/scheduleLogic";
import { effectiveAttendanceTime } from "@/lib/attendanceTime";
import { attendanceMissingItems } from "@/lib/reportWindow";

async function ensureTeacherReportReminderDeliveryTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS TeacherReportReminderDelivery (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      attendanceId INTEGER NOT NULL,
      reminderDate TEXT NOT NULL,
      sentAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(attendanceId, reminderDate)
    )
  `);
}

export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dateIso = taipeiDateIso();
  const pendingFromIso = new Date(`${dateIso}T00:00:00.000Z`);
  pendingFromIso.setUTCDate(pendingFromIso.getUTCDate() - 2);
  const { end } = dayBounds(dateIso);
  await ensureTeacherReportReminderDeliveryTable();
  const attendances = await prisma.attendance.findMany({
    // 封存課程不再發回報提醒，否則停課／重建後的舊課仍會一直催老師回報。
    where: { date: { gte: pendingFromIso, lt: end }, cancelled: false, course: { isActive: true } },
    include: { course: true, actualTeacher: true },
    orderBy: { scheduledTime: "asc" },
  });
  const teacherPending = new Map<number, {
    teacher: (typeof attendances)[number]["actualTeacher"];
    attendances: Array<(typeof attendances)[number]>;
  }>();
  for (const attendance of attendances) {
    const effectiveTime = effectiveAttendanceTime({
      scheduledTime: attendance.scheduledTime,
      courseTime: attendance.course.time,
      attendanceHours: attendance.hours,
      isPayrollLocked: attendance.isPayrollLocked,
      reportContent: attendance.reportContent,
      reportSentAt: attendance.reportSentAt,
      studentCount: attendance.studentCount,
      studentCountA: attendance.studentCountA,
      studentCountB: attendance.studentCountB,
    });
    if (attendanceMissingItems(attendance, effectiveTime).length > 0) {
      const group = teacherPending.get(attendance.actualTeacherId) ?? {
        teacher: attendance.actualTeacher,
        attendances: [],
      };
      group.attendances.push(attendance);
      teacherPending.set(attendance.actualTeacherId, group);
    }
  }

  let teacherReminderSent = 0;
  const errors: string[] = [];
  for (const { teacher, attendances: pending } of teacherPending.values()) {
    if (!teacher.lineUserId) {
      errors.push(`${teacher.name}：尚未綁定 LINE，無法提醒回報`);
      continue;
    }
    const unsent: typeof pending = [];
    for (const attendance of pending) {
      const rows = await prisma.$queryRawUnsafe<Array<{ id: number }>>(
        "SELECT id FROM TeacherReportReminderDelivery WHERE attendanceId = ? AND reminderDate = ? LIMIT 1",
        attendance.id,
        dateIso,
      );
      if (!rows.length) unsent.push(attendance);
    }
    if (!unsent.length) continue;
    try {
      const messages = unsent.slice(0, 5).map((attendance) => buildReportRequestMessage({
        school: attendance.scheduledSchoolName?.trim() || attendance.course.school,
        courseType: attendance.course.courseType,
        attendanceId: attendance.id,
        category: attendance.course.category || attendance.category,
      }));
      const region = (teacher.lineRegion || "north") as LineRegion;
      await pushMessage(teacher.lineUserId, messages, getLineConfig(region).token);
      for (const attendance of unsent.slice(0, 5)) {
        await prisma.$executeRawUnsafe(
          "INSERT OR IGNORE INTO TeacherReportReminderDelivery (attendanceId, reminderDate) VALUES (?, ?)",
          attendance.id,
          dateIso,
        );
      }
      teacherReminderSent += 1;
    } catch (error) {
      errors.push(`${teacher.name} 回報提醒：${error instanceof Error ? error.message : "發送失敗"}`);
    }
  }

  return NextResponse.json({
    ok: errors.length === 0,
    date: dateIso,
    checked: attendances.length,
    teacherReminderSent,
    errors,
  });
}
