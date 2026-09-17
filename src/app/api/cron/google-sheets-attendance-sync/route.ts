import { NextRequest, NextResponse } from "next/server";
import { retryPendingAttendanceSheetSync } from "@/lib/attendanceSheetSync";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ ok: true, ...(await retryPendingAttendanceSheetSync(30)) });
}
