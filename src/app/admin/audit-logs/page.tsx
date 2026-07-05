"use client";
import { useCallback, useEffect, useState } from "react";

type AuditLog = {
  id: number;
  actorName: string;
  actorRole: string;
  action: string;
  targetType: string;
  targetId: string;
  targetLabel: string;
  beforeData: string;
  afterData: string;
  diffSummary: string;
  ipAddress: string;
  userAgent: string;
  sensitive: boolean | number;
  createdAt: string;
};

type PageResult = { items: AuditLog[]; total: number; page: number; pageSize: number };

const ACTIONS = ["", "create", "update", "delete", "soft_delete", "approve", "reject", "export", "send_line", "login", "logout", "reopen", "lock", "unlock", "reset_password"];
const TARGET_TYPES = ["", "Course", "Attendance", "Teacher", "School", "Salary", "SalaryAdjustment", "Substitute", "TeacherLeaveRequest", "SchoolInvoice", "SchoolStartConfirmation", "UserAccount"];

function formatDate(value: string) {
  return value ? new Date(value).toLocaleString("zh-TW", { hour12: false }) : "—";
}

function prettyJson(value: string) {
  if (!value) return "—";
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

export default function AuditLogsPage() {
  const [items, setItems] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [filters, setFilters] = useState({ actor: "", action: "", targetType: "", keyword: "", from: "", to: "", sensitive: false });
  const pageSize = 50;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (filters.actor) params.set("actor", filters.actor);
      if (filters.action) params.set("action", filters.action);
      if (filters.targetType) params.set("targetType", filters.targetType);
      if (filters.keyword) params.set("keyword", filters.keyword);
      if (filters.from) params.set("from", filters.from);
      if (filters.to) params.set("to", filters.to);
      if (filters.sensitive) params.set("sensitive", "1");
      const res = await fetch(`/api/admin/audit-logs?${params}`, { cache: "no-store" });
      if (!res.ok) throw new Error("操作歷程載入失敗");
      const data = await res.json() as PageResult;
      setItems(data.items ?? []);
      setTotal(data.total ?? 0);
    } finally {
      setLoading(false);
    }
  }, [filters, page]);

  useEffect(() => { queueMicrotask(() => { void load(); }); }, [load]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-800">操作歷程</h1>
        <p className="text-sm text-slate-500">只有最高權限可查看，敏感資料已自動遮罩。</p>
      </div>

      <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
          <input value={filters.actor} onChange={(e) => { setFilters({ ...filters, actor: e.target.value }); setPage(1); }} placeholder="操作者" />
          <select value={filters.action} onChange={(e) => { setFilters({ ...filters, action: e.target.value }); setPage(1); }}>
            {ACTIONS.map((action) => <option key={action} value={action}>{action || "全部操作"}</option>)}
          </select>
          <select value={filters.targetType} onChange={(e) => { setFilters({ ...filters, targetType: e.target.value }); setPage(1); }}>
            {TARGET_TYPES.map((target) => <option key={target} value={target}>{target || "全部類型"}</option>)}
          </select>
          <input value={filters.keyword} onChange={(e) => { setFilters({ ...filters, keyword: e.target.value }); setPage(1); }} placeholder="關鍵字" />
          <input type="date" value={filters.from} onChange={(e) => { setFilters({ ...filters, from: e.target.value }); setPage(1); }} />
          <input type="date" value={filters.to} onChange={(e) => { setFilters({ ...filters, to: e.target.value }); setPage(1); }} />
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={filters.sensitive} onChange={(e) => { setFilters({ ...filters, sensitive: e.target.checked }); setPage(1); }} />
            只看敏感操作
          </label>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <button disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="rounded-lg border border-slate-200 bg-white px-3 py-2 disabled:opacity-40">上一頁</button>
            <span>第 {page} / {totalPages} 頁，共 {total} 筆</span>
            <button disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} className="rounded-lg border border-slate-200 bg-white px-3 py-2 disabled:opacity-40">下一頁</button>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">時間</th>
                <th className="px-4 py-3 text-left font-semibold">操作者</th>
                <th className="px-4 py-3 text-left font-semibold">操作</th>
                <th className="px-4 py-3 text-left font-semibold">目標</th>
                <th className="px-4 py-3 text-left font-semibold">摘要</th>
                <th className="px-4 py-3 text-left font-semibold">IP</th>
                <th className="px-4 py-3 text-left font-semibold">詳細</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((item) => (
                <tr key={item.id} className="align-top hover:bg-slate-50/70">
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">{formatDate(item.createdAt)}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{item.actorName || "系統"}</div>
                    <div className="text-xs text-slate-400">{item.actorRole || "—"}</div>
                  </td>
                  <td className="px-4 py-3"><span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">{item.action}</span></td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-700">{item.targetType}</div>
                    <div className="text-xs text-slate-400">{item.targetLabel || item.targetId || "—"}</div>
                  </td>
                  <td className="max-w-[360px] px-4 py-3 text-slate-600">{item.diffSummary || "—"}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">{item.ipAddress || "—"}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => setExpanded(expanded === item.id ? null : item.id)} className="text-sm font-medium text-blue-600 hover:text-blue-800">
                      {expanded === item.id ? "收合" : "查看"}
                    </button>
                    {expanded === item.id && (
                      <div className="mt-3 grid gap-3 rounded-lg border border-slate-100 bg-slate-50 p-3 text-xs">
                        <div>
                          <div className="mb-1 font-semibold text-slate-600">Before</div>
                          <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded bg-white p-2 text-slate-500">{prettyJson(item.beforeData)}</pre>
                        </div>
                        <div>
                          <div className="mb-1 font-semibold text-slate-600">After</div>
                          <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded bg-white p-2 text-slate-500">{prettyJson(item.afterData)}</pre>
                        </div>
                        <div className="text-slate-400">User Agent：{item.userAgent || "—"}</div>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr><td colSpan={7} className="py-10 text-center text-slate-400">{loading ? "載入中…" : "沒有符合條件的操作歷程"}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

