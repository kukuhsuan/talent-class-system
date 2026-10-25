import type { ReactNode } from "react";
import { isReportMaintenanceEnabled, REPORT_MAINTENANCE_DETAIL, REPORT_MAINTENANCE_MESSAGE } from "@/lib/reportMaintenance";

export const dynamic = "force-dynamic";

export default function ReportLayout({ children }: { children: ReactNode }) {
  if (!isReportMaintenanceEnabled()) return children;
  return (
    <section className="mx-auto my-12 max-w-lg rounded-2xl border border-slate-200 bg-white p-8 shadow-sm" role="status">
      <p className="mb-3 text-sm font-medium text-slate-500">服務維護公告</p>
      <h1 className="mb-4 text-2xl font-bold text-slate-900">{REPORT_MAINTENANCE_MESSAGE}</h1>
      <p className="leading-7 text-slate-600">{REPORT_MAINTENANCE_DETAIL}</p>
    </section>
  );
}
