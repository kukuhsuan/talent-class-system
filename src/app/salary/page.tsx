"use client";
import { useCallback, useEffect, useState } from "react";
import { courseLabel, normalizeCategory } from "@/lib/courseMeta";

type Teacher = { id: number; name: string; rateAfterSchool: number; travelFee: number };
type Detail = {
  id: number; date: string; school: string; courseType: string; category: string;
  hours: number; time?: string; hoursNeedsReview?: boolean; hoursReviewReason?: string;
  rate: number; travelFee: number; amount: number; isSub: boolean; role?: string; department: string; notes: string;
};
type SalaryRow = {
  teacher: Teacher;
  regularHours: number; subHours: number; demoHours: number; assistantHours?: number;
  regularPay: number; demoPay: number; assistantPay?: number; travelPay: number; adjustmentTotal: number; total: number;
  hoursReviewCount?: number; hasActivity: boolean; details?: Detail[];
  adjustments: Array<{ id: number; targetMonth: string; payoutMonth: string; type: string; amount: number; reason: string; notes: string; isPaid: boolean }>;
};

const catColor: Record<string, string> = {
  課後: "text-blue-600", 課內: "text-green-600", Demo: "text-orange-500", 營隊: "text-purple-600",
};

export default function SalaryPage() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [data, setData] = useState<{ year: number; month: number; results: SalaryRow[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [sending, setSending] = useState<number | null>(null);
  const [emailing, setEmailing] = useState<number | null>(null);
  const [exporting, setExporting] = useState(false);
  const [sentMsg, setSentMsg] = useState("");
  const [detailLoading, setDetailLoading] = useState<number | null>(null);
  const [showAdjustment, setShowAdjustment] = useState(false);
  const [adjustment, setAdjustment] = useState({ teacherId: 0, targetMonth: "", type: "補發", amount: "", reason: "", notes: "" });

  const load = useCallback(async () => {
    await Promise.resolve();
    setLoading(true);
    const res = await fetch(`/api/salary?year=${year}&month=${month}`);
    const json = await res.json();
    setData(json);
    setLoading(false);
  }, [year, month]);

  useEffect(() => {
    void Promise.resolve().then(() => load());
  }, [load]);

  const toggleExpand = async (id: number) => {
    if (expanded.has(id)) {
      setExpanded((prev) => { const next = new Set(prev); next.delete(id); return next; });
      return;
    }
    const current = data?.results.find((row) => row.teacher.id === id);
    if (!current?.details) {
      setDetailLoading(id);
      const res = await fetch(`/api/salary?year=${year}&month=${month}&teacherId=${id}`);
      const json = await res.json();
      if (res.ok && json.results?.[0]) setData((prev) => prev ? { ...prev, results: prev.results.map((row) => row.teacher.id === id ? json.results[0] : row) } : prev);
      setDetailLoading(null);
    }
    setExpanded((prev) => new Set(prev).add(id));
  };

  const saveAdjustment = async () => {
    const payoutMonth = `${year}-${String(month).padStart(2, "0")}`;
    const res = await fetch("/api/salary-adjustments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...adjustment, teacherId: Number(adjustment.teacherId), amount: Number(adjustment.amount), payoutMonth }) });
    const json = await res.json();
    if (!res.ok) return alert(json.error ?? "薪資調整新增失敗");
    setAdjustment({ teacherId: 0, targetMonth: "", type: "補發", amount: "", reason: "", notes: "" });
    setShowAdjustment(false);
    await load();
  };

  const deleteAdjustment = async (id: number) => {
    if (!confirm("確定刪除此筆薪資調整？")) return;
    const res = await fetch(`/api/salary-adjustments/${id}`, { method: "DELETE" });
    const json = await res.json();
    if (!res.ok) return alert(json.error ?? "刪除失敗");
    await load();
  };

  const sendSalary = async (teacherId: number, teacherName: string) => {
    setSending(teacherId);
    setSentMsg("");
    const res = await fetch("/api/salary/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teacherId, year, month }),
    });
    const json = await res.json();
    setSending(null);
    if (res.ok) {
      setSentMsg(`已傳送給 ${teacherName}`);
      setTimeout(() => setSentMsg(""), 3000);
    } else {
      alert(json.error ?? "傳送失敗");
    }
  };

  const sendAll = async () => {
    if (!data) return;
    const withLine = active.filter((r) => (r.teacher as { lineUserId?: string }).lineUserId);
    if (!confirm(`確定傳送薪資條給 ${withLine.length} 位有綁定 LINE 的老師？`)) return;
    for (const r of withLine) {
      await sendSalary(r.teacher.id, r.teacher.name);
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  };

  const emailSalary = async (teacherId: number, teacherName: string) => {
    setEmailing(teacherId);
    setSentMsg("");
    const res = await fetch("/api/salary/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teacherId, year, month }),
    });
    const json = await res.json();
    setEmailing(null);
    if (res.ok) {
      setSentMsg(`Email 已寄給 ${teacherName}`);
      setTimeout(() => setSentMsg(""), 4000);
    } else {
      alert(json.error ?? "寄送失敗");
    }
  };

  const emailAll = async () => {
    if (!data) return;
    const withEmail = active.filter((r) => (r.teacher as { email?: string }).email);
    if (!confirm(`確定寄送薪資條 Email 給 ${withEmail.length} 位有設定信箱的老師？`)) return;
    for (const r of withEmail) {
      await emailSalary(r.teacher.id, r.teacher.name);
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    setSentMsg(`已寄送給 ${withEmail.length} 位老師`);
  };

  const exportSalary = async () => {
    setExporting(true);
    try {
      const res = await fetch(`/api/export/salary?year=${year}&month=${month}`);
      const contentType = res.headers.get("content-type") ?? "";
      if (!res.ok || !contentType.includes("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")) {
        const text = await res.text();
        let message = text;
        try {
          message = (JSON.parse(text) as { error?: string }).error || text;
        } catch {
          // Keep the plain-text response as the visible error.
        }
        throw new Error(message || `薪資匯出失敗（${res.status}）`);
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `salary-${year}-${String(month).padStart(2, "0")}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      alert(error instanceof Error ? error.message : "薪資匯出失敗");
    } finally {
      setExporting(false);
    }
  };

  const active = data?.results.filter((r) => r.hasActivity) ?? [];
  const displayed = showAll ? (data?.results ?? []) : active;
  const grandTotal = active.reduce((s, r) => s + r.total, 0);
  const fmt = (n: number) => n.toLocaleString("zh-TW");
  const fmtHours = (n: number) => n.toLocaleString("zh-TW", { maximumFractionDigits: 2 });
  const fmtDate = (d: string) => {
    const dt = new Date(d);
    return `${dt.getMonth() + 1}/${dt.getDate()}`;
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-800">月薪資計算</h1>
          <p className="text-sm text-slate-500">自動彙整各老師當月應付薪資</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 mb-6">
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">年份</label>
            <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-24">
              {[2024, 2025, 2026, 2027].map((y) => <option key={y}>{y}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">月份</label>
            <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-20">
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>{m}月</option>
              ))}
            </select>
          </div>
          <button onClick={load} disabled={loading}
            className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-2 rounded-lg transition-colors text-sm disabled:opacity-50">
            {loading ? "計算中..." : "重新計算"}
          </button>
          <button onClick={() => setShowAdjustment((value) => !value)} className="bg-amber-600 hover:bg-amber-700 text-white font-medium px-4 py-2 rounded-lg text-sm">
            + 薪資補發／扣款
          </button>
          <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
            <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} className="w-4 h-4" />
            顯示無課老師
          </label>
          {sentMsg && <span className="text-green-600 text-sm font-medium">{sentMsg}</span>}
        </div>
      </div>

      {showAdjustment && data && (
        <div className="bg-amber-50 rounded-xl border border-amber-200 p-5 mb-6">
          <h2 className="font-semibold text-slate-800 mb-3">新增 {year}年{month}月發放的薪資調整</h2>
          <div className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
            <div><label className="block text-xs text-slate-600 mb-1">老師</label><select value={adjustment.teacherId} onChange={(e) => setAdjustment({ ...adjustment, teacherId: Number(e.target.value) })} className="w-full border rounded-lg px-3 py-2 text-sm"><option value={0}>請選擇</option>{data.results.map((row) => <option key={row.teacher.id} value={row.teacher.id}>{row.teacher.name}</option>)}</select></div>
            <div><label className="block text-xs text-slate-600 mb-1">歸屬月份</label><input type="month" value={adjustment.targetMonth} onChange={(e) => setAdjustment({ ...adjustment, targetMonth: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
            <div><label className="block text-xs text-slate-600 mb-1">類型</label><select value={adjustment.type} onChange={(e) => setAdjustment({ ...adjustment, type: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm"><option>補發</option><option>扣款</option><option>獎金</option><option>其他</option></select></div>
            <div><label className="block text-xs text-slate-600 mb-1">金額（扣款填負數）</label><input type="number" step="1" value={adjustment.amount} onChange={(e) => setAdjustment({ ...adjustment, amount: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
            <div><label className="block text-xs text-slate-600 mb-1">原因</label><input value={adjustment.reason} onChange={(e) => setAdjustment({ ...adjustment, reason: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" /></div>
            <button onClick={saveAdjustment} className="bg-amber-600 text-white rounded-lg px-4 py-2 text-sm font-medium">儲存調整</button>
          </div>
        </div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-blue-50 rounded-xl border border-blue-200 p-4">
              <p className="text-sm text-blue-600 font-medium">有課老師</p>
              <p className="text-2xl font-bold text-blue-800">{active.length} 位</p>
            </div>
            <div className="bg-green-50 rounded-xl border border-green-200 p-4">
              <p className="text-sm text-green-600 font-medium">本月總時數</p>
              <p className="text-2xl font-bold text-green-800">
                {fmtHours(active.reduce((s, r) => s + r.regularHours + r.demoHours + (r.assistantHours ?? 0), 0))} h
              </p>
            </div>
            <div className="bg-orange-50 rounded-xl border border-orange-200 p-4">
              <p className="text-sm text-orange-600 font-medium">代課時數</p>
              <p className="text-2xl font-bold text-orange-800">{fmtHours(active.reduce((s, r) => s + r.subHours, 0))} h</p>
            </div>
            <div className="bg-purple-50 rounded-xl border border-purple-200 p-4">
              <p className="text-sm text-purple-600 font-medium">本月薪資總計</p>
              <p className="text-2xl font-bold text-purple-800">${fmt(grandTotal)}</p>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center flex-wrap gap-2">
              <span className="font-semibold text-slate-700">{year}年 {month}月 薪資明細</span>
              <div className="flex gap-2 flex-wrap">
                <button onClick={emailAll}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-3 py-1.5 rounded-lg text-sm transition-colors">
                  一鍵寄送 Email
                </button>
                <button onClick={sendAll}
                  className="bg-green-600 hover:bg-green-700 text-white font-medium px-3 py-1.5 rounded-lg text-sm transition-colors">
                  一鍵傳送 LINE
                </button>
                <button onClick={exportSalary} disabled={exporting}
                  className="bg-slate-600 hover:bg-slate-700 text-white font-medium px-3 py-1.5 rounded-lg text-sm transition-colors disabled:opacity-50">
                  {exporting ? "匯出中..." : "匯出 Excel"}
                </button>
              </div>
            </div>

            <div className="divide-y divide-slate-100">
              {displayed.map((r) => (
                <div key={r.teacher.id} className={!r.hasActivity ? "opacity-40" : ""}>
                  <div className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 cursor-pointer"
                    onClick={() => r.hasActivity && toggleExpand(r.teacher.id)}>
                    <div className="flex-1 flex items-center gap-4 flex-wrap">
                      <span className="font-semibold text-slate-800 w-20">{r.teacher.name}</span>
                      {(r.regularHours + r.demoHours) > 0 && <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">主教時數 {fmtHours(r.regularHours + r.demoHours)}h</span>}
                      {(r.regularPay + r.demoPay) > 0 && <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">主教薪資 ${fmt(r.regularPay + r.demoPay)}</span>}
                      {r.subHours > 0 && <span className="rounded-full bg-orange-50 px-2.5 py-1 text-xs font-semibold text-orange-600">代課 {fmtHours(r.subHours)}h</span>}
                      {(r.assistantHours ?? 0) > 0 && <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-600">助教時數 {fmtHours(r.assistantHours ?? 0)}h</span>}
                      {(r.assistantPay ?? 0) > 0 && <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-600">助教薪資 ${fmt(r.assistantPay ?? 0)}</span>}
                      {r.travelPay > 0 && <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-600">車費 ${fmt(r.travelPay)}</span>}
                      {r.adjustmentTotal !== 0 && <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${r.adjustmentTotal > 0 ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700"}`}>調整 {r.adjustmentTotal > 0 ? "+" : ""}${fmt(r.adjustmentTotal)}</span>}
                      {(r.hoursReviewCount ?? 0) > 0 && <span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-600">需人工確認 {r.hoursReviewCount} 筆</span>}
                      <span className="font-bold text-blue-700 ml-auto">{r.total > 0 ? `$${fmt(r.total)}` : "—"}</span>
                    </div>
                    <div className="flex items-center gap-2 ml-2" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => emailSalary(r.teacher.id, r.teacher.name)}
                        disabled={emailing === r.teacher.id || !r.hasActivity}
                        className="bg-blue-500 hover:bg-blue-600 text-white text-xs font-medium px-2.5 py-1 rounded-lg transition-colors disabled:opacity-40 whitespace-nowrap"
                      >
                        {emailing === r.teacher.id ? "寄送中..." : "寄 Email"}
                      </button>
                      <button
                        onClick={() => sendSalary(r.teacher.id, r.teacher.name)}
                        disabled={sending === r.teacher.id || !r.hasActivity}
                        className="bg-green-500 hover:bg-green-600 text-white text-xs font-medium px-2.5 py-1 rounded-lg transition-colors disabled:opacity-40 whitespace-nowrap"
                      >
                        {sending === r.teacher.id ? "傳送中..." : "傳 LINE"}
                      </button>
                      {r.hasActivity && (
                        <span className="text-slate-400 text-sm w-4 text-center">{detailLoading === r.teacher.id ? "…" : expanded.has(r.teacher.id) ? "▲" : "▼"}</span>
                      )}
                    </div>
                  </div>

                  {expanded.has(r.teacher.id) && ((r.details?.length ?? 0) > 0 || r.adjustments.length > 0) && (
                    <div className="bg-slate-50 px-4 pb-4">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-xs text-slate-500 border-b border-slate-200">
                            <th className="text-left py-2 font-medium">日期</th>
                            <th className="text-left py-2 font-medium">學校</th>
                            <th className="text-left py-2 font-medium">項目</th>
                            <th className="text-center py-2 font-medium">類別</th>
                            <th className="text-center py-2 font-medium">身份</th>
                            <th className="text-center py-2 font-medium">時間</th>
                            <th className="text-center py-2 font-medium">計薪時數</th>
                            <th className="text-right py-2 font-medium">時薪</th>
                            <th className="text-right py-2 font-medium">車費</th>
                            <th className="text-right py-2 font-medium">金額</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(r.details ?? []).map((d) => (
                            <tr key={d.id} className="border-b border-slate-100 last:border-0">
                              <td className="py-1.5 text-slate-500">{fmtDate(d.date)}</td>
                              <td className="py-1.5 font-medium">
                                {d.school}
                                {d.isSub && <span className="ml-1 text-xs text-orange-500">代</span>}
                              </td>
                              <td className="py-1.5 text-slate-600">{courseLabel(d.courseType)}</td>
                              <td className="py-1.5 text-center">
                                <span className={`text-xs font-medium ${catColor[normalizeCategory(d.category)] ?? "text-slate-500"}`}>{normalizeCategory(d.category)}</span>
                              </td>
                              <td className="py-1.5 text-center">
                                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${d.role === "助教" ? "bg-blue-50 text-blue-600" : "bg-slate-100 text-slate-500"}`}>{d.role ?? "主教"}</span>
                              </td>
                              <td className="py-1.5 text-center text-slate-500">{d.time || "—"}</td>
                              <td className="py-1.5 text-center">
                                {d.hoursNeedsReview ? (
                                  <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-600" title={d.hoursReviewReason}>
                                    需人工確認
                                  </span>
                                ) : `${fmtHours(d.hours)}h`}
                              </td>
                              <td className="py-1.5 text-right text-slate-500">${d.rate}</td>
                              <td className="py-1.5 text-right text-slate-400">{d.travelFee > 0 ? `$${d.travelFee}` : "—"}</td>
                              <td className="py-1.5 text-right font-medium">${fmt(d.amount)}</td>
                            </tr>
                          ))}
                          {r.adjustments.map((item) => (
                            <tr key={`adjustment-${item.id}`} className="border-b border-amber-100 bg-amber-50/50">
                              <td className="py-1.5 text-slate-500">{item.targetMonth}</td><td className="py-1.5 font-medium">{item.reason}</td>
                              <td className="py-1.5 text-slate-600">{item.type}</td><td className="py-1.5 text-center text-amber-700">薪資調整</td>
                              <td colSpan={4} className="py-1.5 text-center text-slate-500">{item.notes || "—"}</td>
                              <td className="py-1.5 text-right"><button onClick={() => deleteAdjustment(item.id)} className="text-xs text-red-600 hover:underline">刪除</button></td>
                              <td className={`py-1.5 text-right font-medium ${item.amount < 0 ? "text-red-600" : "text-amber-700"}`}>{item.amount > 0 ? "+" : ""}${fmt(item.amount)}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="border-t-2 border-slate-300 font-bold">
                            <td colSpan={9} className="pt-2 text-right text-slate-700">本月合計</td>
                            <td className="pt-2 text-right text-blue-700">${fmt(r.total)}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {active.length > 0 && (
              <div className="border-t-2 border-slate-300 bg-slate-50 px-4 py-3 flex justify-between font-bold">
                <span>{active.length} 位老師</span>
                <span className="text-blue-700">${fmt(grandTotal)}</span>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
