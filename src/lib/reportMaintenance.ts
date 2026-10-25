export const REPORT_MAINTENANCE_MESSAGE = "回報功能暫停服務";
export const REPORT_MAINTENANCE_DETAIL = "老師回報功能目前維護中，暫時無法提交或修改。既有資料已保留，如需補登請聯繫行政人員。";

export function isReportMaintenanceEnabled() {
  return process.env.TEACHER_REPORT_MAINTENANCE === "1";
}

export function reportMaintenanceResponse() {
  if (!isReportMaintenanceEnabled()) return null;
  return Response.json(
    { error: REPORT_MAINTENANCE_MESSAGE, code: "REPORT_MAINTENANCE", message: REPORT_MAINTENANCE_DETAIL },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}

export function isTeacherReportAction(action: string | null) {
  return ["report", "report_count", "report_progress", "report_detail", "select_progress"].includes(action ?? "");
}
