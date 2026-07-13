import { NextRequest, NextResponse } from "next/server";
import { createLeaveRequestFromAttendance, listTeacherLeavesFiltered, normalizeLeaveStatusFilter } from "@/lib/teacherLeaves";
import { writeAuditLog } from "@/lib/auditLog";
import { databaseErrorMessage, withDatabaseRetry } from "@/lib/databaseRetry";

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
    const result = await withDatabaseRetry(() => createLeaveRequestFromAttendance({
      attendanceId: Number(data.attendanceId),
      teacherId: Number(data.teacherId),
      reason: String(data.reason ?? ""),
      notes: String(data.notes ?? ""),
    }));
    await writeAuditLog(req, {
      action: "create",
      targetType: "TeacherLeaveRequest",
      targetId: result.id,
      targetLabel: `行政代老師建立請假 #${result.id}`,
      afterData: {
        attendanceId: Number(data.attendanceId),
        teacherId: Number(data.teacherId),
        reason: String(data.reason ?? ""),
        notes: String(data.notes ?? ""),
        status: "待審核",
      },
      diffSummary: "行政代老師建立請假申請",
      sensitive: true,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: databaseErrorMessage(error, "請假申請建立失敗") }, { status: 400 });
  }
}
