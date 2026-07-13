import { NextRequest, NextResponse } from "next/server";
import { upcomingLeaveCourseChoices } from "@/lib/teacherLeaves";
import { databaseErrorMessage, withDatabaseRetry } from "@/lib/databaseRetry";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const teacherId = Number(req.nextUrl.searchParams.get("teacherId"));
  if (!Number.isInteger(teacherId) || teacherId <= 0) {
    return NextResponse.json({ error: "請先選擇老師" }, { status: 400 });
  }

  try {
    const items = await withDatabaseRetry(() => upcomingLeaveCourseChoices(teacherId, 60));
    return NextResponse.json({ items });
  } catch (error) {
    return NextResponse.json({ error: databaseErrorMessage(error, "載入老師課程失敗") }, { status: 400 });
  }
}
