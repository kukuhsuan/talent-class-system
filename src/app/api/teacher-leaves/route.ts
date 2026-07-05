import { NextRequest, NextResponse } from "next/server";
import { createLeaveRequestFromAttendance, listTeacherLeavesFiltered, normalizeLeaveStatusFilter } from "@/lib/teacherLeaves";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const now = new Date();
  const year = Number(searchParams.get("year") ?? now.getFullYear());
  const month = Number(searchParams.get("month") ?? now.getMonth() + 1);
  const rawStatus = searchParams.get("status") ?? "all";
  if (!Number.isInteger(year) || month < 1 || month > 12) {
    return NextResponse.json({ error: "年月格式錯誤" }, { status: 400 });
  }
  const items = await listTeacherLeavesFiltered({
    year,
    month,
    status: rawStatus,
    includeDeleted: searchParams.get("includeDeleted") === "true",
  });
  const status = normalizeLeaveStatusFilter(rawStatus);
  return NextResponse.json({ items, total: items.length, year, month, status: status || "all" });
}

export async function POST(req: NextRequest) {
  try {
    const data = await req.json();
    const result = await createLeaveRequestFromAttendance({
      attendanceId: Number(data.attendanceId),
      teacherId: Number(data.teacherId),
      reason: String(data.reason ?? ""),
      notes: String(data.notes ?? ""),
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message || "請假申請建立失敗" }, { status: 400 });
  }
}
