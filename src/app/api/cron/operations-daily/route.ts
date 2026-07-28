import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLineConfig, pushMessage } from "@/lib/line";
import type { LineRegion } from "@/lib/line";
import { taipeiDateIso } from "@/lib/courseDates";
import { courseDateWindowWhere, courseIdsWithAnyAttendance, dayBounds, dayNameOfIso } from "@/lib/scheduleLogic";
import {
  buildOperationsAttentionMessage,
  buildOperationsScheduleMessage,
  markOperationsDailySent,
  operationsArea,
  operationsDailyWasSent,
  operationsRecipientRows,
  type OperationsAttentionItem,
} from "@/lib/operationsNotifications";
import { recordAutomationRun } from "@/lib/automationHealth";

type BriefRow = { region: string; time: string; school: string; courseType: string; teachers: string };
type RegionalAttentionItem = OperationsAttentionItem & { region: string };

function addIsoDays(iso: string, days: number) {
  const date = new Date(`${iso}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dayOffset = Number(req.nextUrl.searchParams.get("dayOffset")) === 1 ? 1 : 0;
  const preview = req.nextUrl.searchParams.get("preview") === "1";
  const requestedNames = req.nextUrl.searchParams.get("names")
    ?.split(",")
    .map((name) => name.trim())
    .filter(Boolean);
  const dateIso = addIsoDays(taipeiDateIso(), dayOffset);
  const date = new Date(`${dateIso}T00:00:00.000Z`);
  const dayName = dayNameOfIso(dateIso);
  const { start, end } = dayBounds(dateIso);
  const courseWindow = courseDateWindowWhere(dateIso);
  const datedCourseIds = await courseIdsWithAnyAttendance({ isActive: true, ...courseWindow }, date);
  const [attendances, cancelledAttendances, weeklyCourses, recipients] = await Promise.all([
    prisma.attendance.findMany({
      where: { date: { gte: start, lt: end }, cancelled: false, course: { isActive: true, ...courseWindow } },
      include: { course: true, actualTeacher: true, assistantTeacher: true },
      orderBy: { scheduledTime: "asc" },
    }),
    prisma.attendance.findMany({
      where: { date: { gte: start, lt: end }, cancelled: true, course: { isActive: true, ...courseWindow } },
      include: { course: true, actualTeacher: true },
      orderBy: { scheduledTime: "asc" },
    }),
    prisma.course.findMany({
      where: { isActive: true, ...courseWindow, dayOfWeek: dayName, ...(datedCourseIds.size ? { id: { notIn: [...datedCourseIds] } } : {}) },
      include: { teacher: true, assistantTeacher: true },
      orderBy: { time: "asc" },
    }),
    operationsRecipientRows(),
  ]);

  const rows: BriefRow[] = [
    ...attendances.map((attendance) => ({
      region: attendance.course.region,
      time: attendance.scheduledTime || attendance.course.time || "時間未填",
      school: attendance.scheduledSchoolName || attendance.course.school,
      courseType: attendance.course.courseType,
      teachers: [attendance.actualTeacher.name, attendance.assistantTeacher?.name].filter(Boolean).join("／"),
    })),
    ...weeklyCourses.map((course) => ({
      region: course.region,
      time: course.time || "時間未填",
      school: course.school,
      courseType: course.courseType,
      teachers: [course.teacher.name, course.assistantTeacher?.name].filter(Boolean).join("／"),
    })),
  ];
  const attentionItems: RegionalAttentionItem[] = [];
  for (const attendance of attendances) {
    const time = attendance.scheduledTime || attendance.course.time;
    const school = attendance.scheduledSchoolName || attendance.course.school;
    const address = attendance.scheduledAddress || attendance.course.address;
    if (!time.trim()) attentionItems.push({ region: attendance.course.region, level: "urgent", title: `${school} 缺上課時間`, detail: `${attendance.course.courseType}｜請於上課前補齊` });
    if (!address.trim()) attentionItems.push({ region: attendance.course.region, level: "warning", title: `${school} 缺上課地址`, detail: `${attendance.course.courseType}｜老師可能無法確認地點` });
    if (!attendance.actualTeacher.lineUserId) attentionItems.push({ region: attendance.course.region, level: "warning", title: `${attendance.actualTeacher.name} 尚未綁定 LINE`, detail: `${school}｜無法收到課程與異動提醒` });
    if (attendance.actualTeacherId !== attendance.course.teacherId) attentionItems.push({ region: attendance.course.region, level: "urgent", title: `${school} 已安排代課`, detail: `${time || "時間未填"}｜${attendance.course.teacherId ? "原老師已更換" : "請確認代課"} → ${attendance.actualTeacher.name}` });
    if (attendance.category.toLowerCase().includes("demo") || attendance.course.courseType.toLowerCase().includes("demo")) attentionItems.push({ region: attendance.course.region, level: "notice", title: `${school} 為 Demo 課`, detail: "不可向園所請款，只計教練 Demo 費用" });
  }
  for (const course of weeklyCourses) {
    if (!course.time.trim()) attentionItems.push({ region: course.region, level: "urgent", title: `${course.school} 缺上課時間`, detail: `${course.courseType}｜請於上課前補齊` });
    if (!course.address.trim()) attentionItems.push({ region: course.region, level: "warning", title: `${course.school} 缺上課地址`, detail: `${course.courseType}｜老師可能無法確認地點` });
    if (!course.teacher.lineUserId) attentionItems.push({ region: course.region, level: "warning", title: `${course.teacher.name} 尚未綁定 LINE`, detail: `${course.school}｜無法收到課程與異動提醒` });
    if (course.category.toLowerCase().includes("demo") || course.courseType.toLowerCase().includes("demo")) attentionItems.push({ region: course.region, level: "notice", title: `${course.school} 為 Demo 課`, detail: "不可向園所請款，只計教練 Demo 費用" });
  }
  for (const attendance of cancelledAttendances) {
    attentionItems.push({
      region: attendance.course.region,
      level: "urgent",
      title: `${attendance.course.school} 已停課`,
      detail: `${attendance.scheduledTime || attendance.course.time || "時間未填"}｜${attendance.course.courseType}${attendance.cancelReason ? `｜${attendance.cancelReason}` : ""}`,
    });
  }

  let sent = 0;
  let skippedAlreadySent = 0;
  const errors: string[] = [];
  for (const item of recipients.filter((recipient) => !requestedNames?.length || requestedNames.includes(recipient.name))) {
    const teacher = item.teacher;
    if (!teacher?.lineUserId) {
      errors.push(`${item.name}：尚未綁定 LINE`);
      continue;
    }
    const shouldDedupe = !preview && !requestedNames?.length;
    if (shouldDedupe && await operationsDailyWasSent(teacher.id, dateIso, dayOffset)) {
      skippedAlreadySent++;
      continue;
    }
    const areaRows = rows
      .filter((row) => item.area === "all" || operationsArea(row.region) === item.area)
      .sort((a, b) => a.time.localeCompare(b.time, "zh-Hant"));
    const message = buildOperationsScheduleMessage({
      areaLabel: item.label,
      dateIso,
      dayName,
      dayLabel: dayOffset === 1 ? "明日" : "今日",
      preview,
      rows: areaRows,
    });
    const areaAttentionItems = attentionItems.filter((attention) => item.area === "all" || operationsArea(attention.region) === item.area);
    const attentionMessage = buildOperationsAttentionMessage({
      areaLabel: item.label,
      dateIso,
      dayLabel: dayOffset === 1 ? "明日" : "今日",
      items: areaAttentionItems,
    });
    try {
      const region = (teacher.lineRegion || "north") as LineRegion;
      await pushMessage(teacher.lineUserId, [message, attentionMessage], getLineConfig(region).token);
      if (shouldDedupe) await markOperationsDailySent(teacher.id, dateIso, dayOffset);
      sent++;
    } catch (error) {
      errors.push(`${item.name}：${error instanceof Error ? error.message : "發送失敗"}`);
    }
  }

  if (!preview && !requestedNames?.length) {
    const total = recipients.length;
    await recordAutomationRun({
      jobKey: `operations-daily:${dayOffset}`,
      targetDate: dateIso,
      status: errors.length ? (sent || skippedAlreadySent ? "partial" : "failed") : "success",
      total,
      success: sent + skippedAlreadySent,
      failed: errors.length,
      details: errors.join("\n"),
    }).catch(() => undefined);
  }

  return NextResponse.json({
    ok: errors.length === 0,
    date: dateIso,
    dayOffset,
    preview,
    totalCourses: rows.length,
    attentionItems: attentionItems.length,
    sent,
    skippedAlreadySent,
    errors,
  });
}
