import { NextRequest, NextResponse } from "next/server";
import { ADMIN_ROLES, requireRole } from "@/lib/permissions";
import { notifySchoolReport } from "@/lib/schoolNotification";
import { getSystemAlert, updateSystemAlertStatus } from "@/lib/systemAlerts";
import { writeAuditLog } from "@/lib/auditLog";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(ADMIN_ROLES);
  if (auth.response) return auth.response;
  const { id } = await params;
  const alertId = Number(id);
  if (!Number.isInteger(alertId)) return NextResponse.json({ error: "異常單編號錯誤" }, { status: 400 });

  const alert = await getSystemAlert(alertId);
  if (!alert) return NextResponse.json({ error: "找不到異常單" }, { status: 404 });
  const attendanceId = Number(alert.dedupeKey.match(/^notify-fail:(\d+)$/)?.[1]);
  if (!attendanceId) {
    return NextResponse.json({ error: "這類異常目前不支援直接重送，請使用「前往處理」" }, { status: 400 });
  }

  const result = await notifySchoolReport(attendanceId);
  if (result.status !== "通知成功") {
    return NextResponse.json({ error: result.error || "園所通知仍然失敗" }, { status: 400 });
  }

  const actorName = auth.user?.name || "管理員";
  await updateSystemAlertStatus(alertId, "已處理", actorName, "由異常管理中心重新發送成功");
  await writeAuditLog(req, {
    action: "retry_notification",
    targetType: "SystemAlert",
    targetId: alertId,
    targetLabel: alert.title,
    diffSummary: `重送園所通知成功（出勤 #${attendanceId}）`,
  });
  return NextResponse.json({ ok: true, status: result.status });
}
