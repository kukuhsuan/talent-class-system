import { NextRequest, NextResponse } from "next/server";
import { getLineConfig, pushMessage } from "@/lib/line";
import type { LineRegion } from "@/lib/line";
import {
  arrivalDetailsForDate,
  buildArrivalReminderText,
  hasTeacherArrived,
  markArrivalReminderSent,
  reminderKindForDetail,
} from "@/lib/attendanceArrival";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const querySecret = req.nextUrl.searchParams.get("secret") ?? "";
  const debug = req.nextUrl.searchParams.get("debug") === "1";
  const expectedSecret = process.env.CRON_SECRET ?? "";
  const authorized = Boolean(expectedSecret)
    && (authHeader === `Bearer ${expectedSecret}` || querySecret === expectedSecret);
  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const details = await arrivalDetailsForDate({ createMissing: true });
  const nowTaipei = new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date());
  let preClassRemindersSent = 0;
  let lateRemindersSent = 0;
  let skippedAlreadyArrived = 0;
  let skippedNoLine = 0;
  let skippedAlreadySent = 0;
  let skippedNotDue = 0;
  let skippedExpired = 0;
  const errors: string[] = [];
  const debugItems: Array<{
    attendanceId: number;
    school: string;
    courseType: string;
    time: string;
    teacherName: string;
    status: string;
    statusLabel: string;
    canPushLine: boolean;
    reminderKind: string | null;
    reason: string;
  }> = [];

  for (const detail of details) {
    const kind = reminderKindForDetail(detail);
    let reason = kind ? "ready_to_send" : detail.status;
    if (!kind) {
      if (detail.arrivedAt) {
        skippedAlreadyArrived++;
        reason = "already_arrived";
      }
      else if (detail.status === "not_due") skippedNotDue++;
      else if (detail.status === "expired_missing") skippedExpired++;
      else if (
        (detail.status === "pre_missing" && detail.reminderSent)
        || (detail.status === "late_missing" && detail.lateReminderSent)
      ) {
        skippedAlreadySent++;
        reason = "already_sent";
      }
      if (debug) debugItems.push({
        attendanceId: detail.attendanceId,
        school: detail.school,
        courseType: detail.courseType,
        time: detail.time,
        teacherName: detail.teacherName,
        status: detail.status,
        statusLabel: detail.statusLabel,
        canPushLine: detail.canPushLine,
        reminderKind: null,
        reason,
      });
      continue;
    }
    if (!detail.canPushLine || !detail.teacherLineUserId || !detail.teacherLineRegion) {
      skippedNoLine++;
      if (debug) debugItems.push({
        attendanceId: detail.attendanceId,
        school: detail.school,
        courseType: detail.courseType,
        time: detail.time,
        teacherName: detail.teacherName,
        status: detail.status,
        statusLabel: detail.statusLabel,
        canPushLine: detail.canPushLine,
        reminderKind: kind,
        reason: "no_line_binding",
      });
      continue;
    }

    try {
      if (await hasTeacherArrived(detail.attendanceId)) {
        skippedAlreadyArrived++;
        if (debug) debugItems.push({
          attendanceId: detail.attendanceId,
          school: detail.school,
          courseType: detail.courseType,
          time: detail.time,
          teacherName: detail.teacherName,
          status: detail.status,
          statusLabel: detail.statusLabel,
          canPushLine: detail.canPushLine,
          reminderKind: kind,
          reason: "already_arrived_before_send",
        });
        continue;
      }
      const cfg = getLineConfig(detail.teacherLineRegion as LineRegion);
      await pushMessage(detail.teacherLineUserId, [{ type: "text", text: buildArrivalReminderText(detail, kind) }], cfg.token);
      await markArrivalReminderSent(detail.attendanceId, kind);
      if (kind === "late") lateRemindersSent++;
      else preClassRemindersSent++;
      if (debug) debugItems.push({
        attendanceId: detail.attendanceId,
        school: detail.school,
        courseType: detail.courseType,
        time: detail.time,
        teacherName: detail.teacherName,
        status: detail.status,
        statusLabel: detail.statusLabel,
        canPushLine: detail.canPushLine,
        reminderKind: kind,
        reason: "sent",
      });
    } catch (error) {
      errors.push(`${detail.teacherName} ${detail.school} ${detail.time}: ${(error as Error).message || error}`);
      if (debug) debugItems.push({
        attendanceId: detail.attendanceId,
        school: detail.school,
        courseType: detail.courseType,
        time: detail.time,
        teacherName: detail.teacherName,
        status: detail.status,
        statusLabel: detail.statusLabel,
        canPushLine: detail.canPushLine,
        reminderKind: kind,
        reason: "push_error",
      });
    }
  }

  const response = {
    ok: true,
    nowTaipei,
    checked: details.length,
    preClassRemindersSent,
    lateRemindersSent,
    skippedAlreadyArrived,
    skippedNoLine,
    skippedAlreadySent,
    skippedNotDue,
    skippedExpired,
    errors,
    ...(debug ? { items: debugItems.slice(0, 100) } : {}),
  };

  console.log("teacher arrival reminder cron", {
    nowTaipei,
    checked: response.checked,
    preClassRemindersSent,
    lateRemindersSent,
    skippedAlreadyArrived,
    skippedNoLine,
    skippedAlreadySent,
    skippedNotDue,
    skippedExpired,
    errorCount: errors.length,
  });

  return NextResponse.json(response);
}
