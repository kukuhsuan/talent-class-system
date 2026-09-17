import { NextRequest, NextResponse } from "next/server";
import { retryPendingAttendanceSheetSync } from "@/lib/attendanceSheetSync";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await retryPendingAttendanceSheetSync();
  console.info("Google Sheets attendance sync", result);
  return NextResponse.json({ ok: true, ...result });
}
