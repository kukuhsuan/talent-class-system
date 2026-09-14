import { NextRequest, NextResponse } from "next/server";
import { ADMIN_ROLES, requireRole } from "@/lib/permissions";
import { flushSchoolCourseChangesForDate } from "@/lib/schoolNotification";
import { writeAuditLog } from "@/lib/auditLog";

export async function GET(req: NextRequest) {
  const auth = await requireRole(ADMIN_ROLES);
  if (auth.response) return auth.response;

  const targetDate = req.nextUrl.searchParams.get("targetDate")?.trim() || "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
    return NextResponse.json({ error: "請提供正確的通知日期" }, { status: 400 });
  }
  if (req.nextUrl.searchParams.get("confirm") !== "SEND") {
    return NextResponse.json({ error: "尚未確認發送" }, { status: 400 });
  }

  const result = await flushSchoolCourseChangesForDate(targetDate);
  await writeAuditLog(req, {
    action: "send_school_course_change_notifications",
    targetType: "SchoolCourseChangeNotification",
    targetLabel: `${targetDate} 園所課程異動通知`,
    diffSummary: `手動補發園所異動通知：共 ${result.total} 堂，成功 ${result.sent}，失敗 ${result.failed}`,
  });
  return NextResponse.json({ ok: result.failed === 0, targetDate, ...result });
}
