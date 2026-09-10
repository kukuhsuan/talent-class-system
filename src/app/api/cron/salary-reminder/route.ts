import { NextRequest, NextResponse } from "next/server";
import { getLineConfig, pushMessage } from "@/lib/line";
import type { LineRegion } from "@/lib/line";
import {
  buildSalaryReminderMessage,
  markOperationsDailySent,
  operationsDailyWasSent,
  operationsRecipientRows,
} from "@/lib/operationsNotifications";
import { recordAutomationRun } from "@/lib/automationHealth";
import { taipeiDateIso } from "@/lib/courseDates";

export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const today = taipeiDateIso();
  const [year, month] = today.split("-").map(Number);
  const preview = req.nextUrl.searchParams.get("preview") === "1";
  const recipients = await operationsRecipientRows();
  const errors: string[] = [];
  let sent = 0;
  let skippedAlreadySent = 0;

  for (const item of recipients) {
    const teacher = item.teacher;
    if (!teacher?.lineUserId) {
      errors.push(`${item.name}：尚未綁定 LINE`);
      continue;
    }
    if (!preview && await operationsDailyWasSent(teacher.id, today, 28)) {
      skippedAlreadySent++;
      continue;
    }
    try {
      const region = (teacher.lineRegion || "north") as LineRegion;
      await pushMessage(teacher.lineUserId, [buildSalaryReminderMessage({ year, month })], getLineConfig(region).token);
      if (!preview) await markOperationsDailySent(teacher.id, today, 28);
      sent++;
    } catch (error) {
      errors.push(`${item.name}：${error instanceof Error ? error.message : "發送失敗"}`);
    }
  }

  if (!preview) {
    await recordAutomationRun({
      jobKey: "salary-reminder",
      targetDate: today,
      status: errors.length ? (sent || skippedAlreadySent ? "partial" : "failed") : "success",
      total: recipients.length,
      success: sent + skippedAlreadySent,
      failed: errors.length,
      details: errors.join("\n"),
    }).catch(() => undefined);
  }

  return NextResponse.json({ ok: errors.length === 0, date: today, sent, skippedAlreadySent, errors });
}
