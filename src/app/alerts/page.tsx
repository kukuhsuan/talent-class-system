"use client";
import { useCallback, useEffect, useState } from "react";
import { Toast } from "@/components/Toast";
import { useToast } from "@/lib/useToast";

type AlertRow = {
  id: number;
  level: string;
  category: string;
  title: string;
  detail: string;
  status: string;
  resolvedBy: string;
  resolvedAt: string | null;
  notifiedAt: string | null;
  createdAt: string;
};

const LEVEL_STYLE: Record<string, string> = {
  P1: "bg-red-100 text-red-700",
  P2: "bg-amber-100 text-amber-700",
  P3: "bg-slate-100 text-slate-600",
};

const STATUS_TABS = ["未處理", "已處理", "已忽略"] as const;

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>("未處理");
  const [levelFilter, setLevelFilter] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const { toast, showToast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      if (levelFilter) params.set("level", levelFilter);
      const res = await fetch(`/api/alerts?${params}`, { cache: "no-store" });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || "載入失敗");
      setAlerts(await res.json());
    } catch (error) {
      showToast("error", (error as Error).message);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, levelFilter, showToast]);

  useEffect(() => { void Promise.resolve().then(() => load()); }, [load]);

  async function updateStatus(id: number, status: string) {
    setUpdatingId(id);
    try {
      const res = await fetch(`/api/alerts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || "更新失敗");
      showToast("success", `已標記為「${status}」`);
      await load();
    } catch (error) {
      showToast("error", (error as Error).message);
    } finally {
      setUpdatingId(null);
    }
  }

  const p1Count = alerts.filter((a) => a.level === "P1").length;

  return (
    <main className="mx-auto max-w-5xl px-3 py-6 md:px-4">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold text-slate-800">異常管理中心</h1>
        {statusFilter === "未處理" && p1Count > 0 && (
          <span className="rounded-full bg-red-100 px-3 py-1 text-sm font-semibold text-red-700">
            {p1Count} 筆 P1 待處理
          </span>
        )}
      </div>
      <p className="mb-4 text-sm text-slate-500">
        每日自動掃描：代課懸空、未回報課程、請款斷鏈、園所通知失敗。P1 異常會即時推播 LINE 給主管。
      </p>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setStatusFilter(tab)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              statusFilter === tab ? "bg-blue-900 text-white" : "bg-white text-slate-600 shadow-sm hover:bg-slate-50"
            }`}
          >
            {tab}
          </button>
        ))}
        <span className="mx-1 text-slate-300">|</span>
        {["", "P1", "P2"].map((level) => (
          <button
            key={level || "all"}
            onClick={() => setLevelFilter(level)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              levelFilter === level ? "bg-blue-900 text-white" : "bg-white text-slate-600 shadow-sm hover:bg-slate-50"
            }`}
          >
            {level || "全部等級"}
          </button>
        ))}
        <button onClick={load} className="ml-auto rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-slate-600 shadow-sm hover:bg-slate-50">
          重新整理
        </button>
      </div>

      {loading ? (
        <div className="rounded-2xl bg-white p-8 text-center text-sm text-slate-400 shadow-sm">載入中…</div>
      ) : alerts.length === 0 ? (
        <div className="rounded-2xl bg-white p-8 text-center text-sm text-slate-400 shadow-sm">
          {statusFilter === "未處理" ? "🎉 目前沒有待處理的異常" : "沒有符合條件的紀錄"}
        </div>
      ) : (
        <div className="space-y-3">
          {alerts.map((alert) => (
            <div key={alert.id} className="rounded-2xl bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-start gap-2">
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${LEVEL_STYLE[alert.level] ?? LEVEL_STYLE.P3}`}>
                  {alert.level}
                </span>
                <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700">{alert.category}</span>
                {alert.notifiedAt && <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">已推播主管</span>}
                <span className="ml-auto text-xs text-slate-400">{String(alert.createdAt).slice(0, 16).replace("T", " ")}</span>
              </div>
              <div className="mt-2 text-sm font-semibold text-slate-800">{alert.title}</div>
              {alert.detail && <div className="mt-1 whitespace-pre-wrap text-sm text-slate-500">{alert.detail}</div>}
              {alert.status === "未處理" ? (
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => updateStatus(alert.id, "已處理")}
                    disabled={updatingId === alert.id}
                    className="rounded-lg bg-blue-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50"
                  >
                    標記已處理
                  </button>
                  <button
                    onClick={() => updateStatus(alert.id, "已忽略")}
                    disabled={updatingId === alert.id}
                    className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-200 disabled:opacity-50"
                  >
                    忽略
                  </button>
                </div>
              ) : (
                <div className="mt-2 text-xs text-slate-400">
                  {alert.status}｜{alert.resolvedBy}{alert.resolvedAt ? `｜${String(alert.resolvedAt).slice(0, 16).replace("T", " ")}` : ""}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      <Toast toast={toast} />
    </main>
  );
}
