import { NextRequest, NextResponse } from "next/server";
import { retryPendingAttendanceSheetSync } from "@/lib/attendanceSheetSync";
import { ADMIN_ROLES, requireRole, sameOriginOk } from "@/lib/permissions";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await retryPendingAttendanceSheetSync();
  console.info("Google Sheets attendance sync", result);
  return NextResponse.json({ ok: true, ...result });
}

// 後台人工同步：讓行政／助理在出勤紀錄頁按鈕立即執行，不必等待排程。
export async function POST(req: NextRequest) {
  if (!sameOriginOk(req)) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  const auth = await requireRole(ADMIN_ROLES);
  if (auth.response) return auth.response;
  const result = await retryPendingAttendanceSheetSync();
  console.info("Google Sheets attendance manual sync", { ...result, actor: auth.user?.name });
  return NextResponse.json({ ok: true, ...result });
}
