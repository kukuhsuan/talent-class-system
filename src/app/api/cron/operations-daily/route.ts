import { NextRequest, NextResponse } from "next/server";

// 已停用（2026-10-25）：不再通知三位客服每日課程狀況。
// 排程已從 vercel.json 移除；保留這支路由只是為了讓舊的觸發回應明確的「已停用」，不會發送任何訊息。
// 原本的程式碼可從 git 歷史取回。
export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ ok: true, disabled: true, reason: "已停用：不再通知客服每日課程狀況" });
}
