import { NextRequest, NextResponse } from "next/server";
import { ADMIN_ROLES, requireRole } from "@/lib/permissions";
import { writeAuditLog } from "@/lib/auditLog";
import { ALERT_STATUS, updateSystemAlertStatus } from "@/lib/systemAlerts";

const ALLOWED_STATUS = new Set<string>(Object.values(ALERT_STATUS));

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(ADMIN_ROLES);
  if (auth.response) return auth.response;
  try {
    const { id } = await params;
    const alertId = Number(id);
    if (!Number.isFinite(alertId)) return NextResponse.json({ error: "id 格式錯誤" }, { status: 400 });
    const data = await req.json();
    const status = String(data.status ?? "");
    if (!ALLOWED_STATUS.has(status)) return NextResponse.json({ error: "狀態不合法" }, { status: 400 });
    const resolutionNote = String(data.resolutionNote ?? "").trim();
    if ((status === ALERT_STATUS.resolved || status === ALERT_STATUS.ignored) && !resolutionNote) {
      return NextResponse.json({ error: "請填寫處理方式後再關閉異常" }, { status: 400 });
    }
    await updateSystemAlertStatus(alertId, status, auth.user?.name ?? "", resolutionNote);
    await writeAuditLog(req, {
      action: "update",
      targetType: "SystemAlert",
      targetId: alertId,
      targetLabel: `異常單 #${alertId}`,
      diffSummary: `異常單狀態 → ${status}；處理方式：${resolutionNote}`,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
