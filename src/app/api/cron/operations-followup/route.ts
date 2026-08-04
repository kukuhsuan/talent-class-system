import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildReportRequestMessage, getLineConfig, pushMessage } from "@/lib/line";
import type { LineRegion } from "@/lib/line";
import { taipeiDateIso } from "@/lib/courseDates";
import { normalizeCategory, requiresStudentCount } from "@/lib/courseMeta";
import { salaryHoursFromValues } from "@/lib/salaryHours";
import { attendanceHoursOverrideMap } from "@/lib/attendanceHoursOverride";
import { dayBounds } from "@/lib/scheduleLogic";
import { effectiveAttendanceTime } from "@/lib/attendanceTime";
import { attendanceMissingItems } from "@/lib/reportWindow";
import {
  buildOperationsAttentionMessage,
  operationsArea,
  operationsRecipientRows,
  type OperationsAttentionItem,
} from "@/lib/operationsNotifications";

type RegionalAttentionItem = OperationsAttentionItem & { region: string };

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
  const [attendances, recipients] = await Promise.all([
    prisma.attendance.findMany({
      where: { date: { gte: pendingFromIso, lt: end }, cancelled: false },
      include: { course: true, actualTeacher: true },
      orderBy: { scheduledTime: "asc" },
    }),
    operationsRecipientRows(),
  ]);
  // 判斷「計薪時數待確認」要和薪資用同一套規則，否則會對已經人工調整過的課誤報
  const hoursOverrideMap = await attendanceHoursOverrideMap(attendances.map((a) => a.id));
  const items: RegionalAttentionItem[] = [];
  const teacherPending = new Map<number, {
    teacher: (typeof attendances)[number]["actualTeacher"];
    attendances: Array<(typeof attendances)[number]>;
  }>();
  for (const attendance of attendances) {
    const category = attendance.category || attendance.course.category;
    const normalized = normalizeCategory(category);
    const school = attendance.scheduledSchoolName || attendance.course.school;
    const time = attendance.scheduledTime || attendance.course.time || "時間未填";
    const prefix = `${school}｜${attendance.course.courseType}`;
    const isToday = attendance.date.toISOString().slice(0, 10) === dateIso;
    if (isToday && normalized !== "Demo" && requiresStudentCount(category)
      && attendance.studentCount == null && attendance.studentCountA == null && attendance.studentCountB == null) {
      items.push({ region: attendance.course.region, level: "warning", title: `${prefix} 尚未填人數`, detail: `${time}｜${attendance.actualTeacher.name}｜請完成課後人數` });
    }
    if (isToday && normalized !== "Demo" && !requiresStudentCount(category)) {
      const hours = salaryHoursFromValues(attendance.hours, attendance.course.payrollHours, time, hoursOverrideMap.get(attendance.id) === true);
      if (hours.needsReview) items.push({ region: attendance.course.region, level: "warning", title: `${prefix} 計薪時數待確認`, detail: `${time}｜${attendance.actualTeacher.name}｜${hours.reason}` });
    }
    if (isToday && !attendance.reportContent.trim()) {
      items.push({ region: attendance.course.region, level: "notice", title: `${prefix} 建議補課程回報`, detail: `${time}｜回報不是結帳阻擋，但建議補上孩子表現與課程內容` });
    }
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

  let sent = 0;
  let teacherReminderSent = 0;
  const errors: string[] = [];
  for (const recipient of recipients) {
    const teacher = recipient.teacher;
    if (!teacher?.lineUserId) {
      errors.push(`${recipient.name}：尚未綁定 LINE`);
      continue;
    }
    const areaItems = items.filter((item) => recipient.area === "all" || operationsArea(item.region) === recipient.area);
    if (!areaItems.length) continue;
    try {
      const region = (teacher.lineRegion || "north") as LineRegion;
      const message = buildOperationsAttentionMessage({ areaLabel: recipient.label, dateIso, dayLabel: "今日", items: areaItems });
      await pushMessage(teacher.lineUserId, [message], getLineConfig(region).token);
      sent++;
    } catch (error) {
      errors.push(`${recipient.name}：${error instanceof Error ? error.message : "發送失敗"}`);
    }
  }

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
    attentionItems: items.length,
    sent,
    teacherReminderSent,
    errors,
  });
}
