import { NextRequest, NextResponse } from "next/server";
import { listCourseBriefings, sendCourseBriefing } from "@/lib/courseBriefing";
import { taipeiDateIso } from "@/lib/courseDates";

function addDays(iso: string, days: number) {
  const date = new Date(`${iso}T00:00:00+08:00`);
  date.setDate(date.getDate() + days);
  return taipeiDateIso(date);
}

export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const mode = req.nextUrl.searchParams.get("mode") === "tomorrow" ? "tomorrow" : "today";
  const targetDate = addDays(taipeiDateIso(), mode === "tomorrow" ? 1 : 0);
  const rows = (await listCourseBriefings({ from: targetDate, to: targetDate, limit: 200 }))
    .filter((row) => row.status === "pending")
    .filter((row) => mode === "tomorrow" ? !row.dayBeforeSentAt : !row.sameDaySentAt);
  let sent = 0;
  const errors: string[] = [];
  for (const row of rows) {
    try {
      await sendCourseBriefing(row, mode === "tomorrow" ? "dayBefore" : "sameDay");
      sent += 1;
    } catch (error) {
      errors.push(`${row.teacherName}：${(error as Error).message}`);
    }
  }
  return NextResponse.json({ ok: errors.length === 0, mode, targetDate, total: rows.length, sent, errors });
}
