import { NextRequest, NextResponse } from "next/server";
import { sendScheduleLookupTest } from "@/app/api/line/schedule/route";

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const result = await sendScheduleLookupTest(body);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "課表測試發送失敗" },
      { status: 400 },
    );
  }
}
