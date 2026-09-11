import { NextRequest, NextResponse } from "next/server";
import { taipeiDateIso } from "@/lib/courseDates";
import { flushSchoolCourseChangesForDate } from "@/lib/schoolNotification";
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
  const result = await flushSchoolCourseChangesForDate(targetDate);
  await recordAutomationRun({
    jobKey: "school-course-change-reminder",
    targetDate,
    status: result.failed === 0 ? "success" : result.sent > 0 ? "partial" : "failed",
    total: result.total,
    success: result.sent,
    failed: result.failed,
    details: result.errors.join("；"),
  });
  return NextResponse.json({ ok: result.failed === 0, targetDate, ...result });
}
