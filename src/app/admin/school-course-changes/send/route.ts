import { NextRequest, NextResponse } from "next/server";
import { ADMIN_ROLES, requireRole } from "@/lib/permissions";
import { flushSchoolCourseChangesForDate } from "@/lib/schoolNotification";
import { writeAuditLog } from "@/lib/auditLog";

export async function GET(req: NextRequest) {
  const auth = await requireRole(ADMIN_ROLES);
  if (auth.response) return auth.response;

  const targetDate = req.nextUrl.searchParams.get("targetDate")?.trim() || "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate) || req.nextUrl.searchParams.get("confirm") !== "SEND") {
    return new NextResponse("日期或確認參數錯誤", { status: 400, headers: { "content-type": "text/plain; charset=utf-8" } });
  }

  const result = await flushSchoolCourseChangesForDate(targetDate);
  await writeAuditLog(req, {
    action: "send_school_course_change_notifications",
    targetType: "SchoolCourseChangeNotification",
    targetLabel: `${targetDate} 園所課程異動通知`,
    diffSummary: `手動補發園所異動通知：共 ${result.total} 堂，成功 ${result.sent}，失敗 ${result.failed}`,
  });
  const details = result.errors.length ? `<h2>失敗原因</h2><ul>${result.errors.map((error) => `<li>${escapeHtml(error)}</li>`).join("")}</ul>` : "";
  return new NextResponse(`<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><title>園所通知補發結果</title><body style="font-family:system-ui;padding:40px"><h1>園所通知補發完成</h1><p>日期：${targetDate}</p><p>共 ${result.total} 堂｜成功 ${result.sent}｜失敗 ${result.failed}</p>${details}</body></html>`, {
    status: result.failed === 0 ? 200 : 207,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] || char);
}
