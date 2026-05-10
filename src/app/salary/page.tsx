"use client";
import { useEffect, useState } from "react";

type Teacher = { id: number; name: string; rateAfterSchool: number; travelFee: number };
type Detail = {
  id: number; date: string; school: string; courseType: string; category: string;
  hours: number; rate: number; travelFee: number; amount: number; isSub: boolean; department: string; notes: string;
};
type SalaryRow = {
  teacher: Teacher;
  regularHours: number; subHours: number; demoHours: number;
  regularPay: number; demoPay: number; travelPay: number; total: number;
  hasActivity: boolean; details: Detail[];
};

const catColor: Record<string, string> = {
  課後: "text-blue-600", 課內: "text-green-600", Demo: "text-orange-500", 試上: "text-purple-500", 安親: "text-pink-500", 社團: "text-teal-500",
};

export default function SalaryPage() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [data, setData] = useState<{ year: number; month: number; results: SalaryRow[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [sending, setSending] = useState<number | null>(null);
  const [sentMsg, setSentMsg] = useState("");

  const load = async () => {
    setLoading(true);
    const res = await fetch(`/api/salary?year=${year}&month=${month}`);
    const json = await res.json();
    setData(json);
    setLoading(false);
  };

  useEffect(() => { load(); }, [year, month]);

  const toggleExpand = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
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

  const active = data?.results.filter((r) => r.hasActivity) ?? [];
  const displayed = showAll ? (data?.results ?? []) : active;
  const grandTotal = active.reduce((s, r) => s + r.total, 0);
  const fmt = (n: number) => n.toLocaleString("zh-TW");
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
          <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
            <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} className="w-4 h-4" />
            顯示無課老師
          </label>
          {sentMsg && <span className="text-green-600 text-sm font-medium">{sentMsg}</span>}
        </div>
      </div>

      {data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-blue-50 rounded-xl border border-blue-200 p-4">
              <p className="text-sm text-blue-600 font-medium">有課老師</p>
              <p className="text-2xl font-bold text-blue-800">{active.length} 位</p>
            </div>
            <div className="bg-green-50 rounded-xl border border-green-200 p-4">
              <p className="text-sm text-green-600 font-medium">本月總節數</p>
              <p className="text-2xl font-bold text-green-800">
                {active.reduce((s, r) => s + r.regularHours + r.demoHours, 0)} 節
              </p>
            </div>
            <div className="bg-orange-50 rounded-xl border border-orange-200 p-4">
              <p className="text-sm text-orange-600 font-medium">代課節數</p>
              <p className="text-2xl font-bold text-orange-800">{active.reduce((s, r) => s + r.subHours, 0)} 節</p>
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
                <button onClick={sendAll}
                  className="bg-green-600 hover:bg-green-700 text-white font-medium px-3 py-1.5 rounded-lg text-sm transition-colors">
                  一鍵傳送全部薪資條
                </button>
                <a href={`/api/export/salary?year=${year}&month=${month}`} download
                  className="bg-slate-600 hover:bg-slate-700 text-white font-medium px-3 py-1.5 rounded-lg text-sm transition-colors">
                  匯出 Excel
                </a>
              </div>
            </div>

            <div className="divide-y divide-slate-100">
              {displayed.map((r) => (
                <div key={r.teacher.id} className={!r.hasActivity ? "opacity-40" : ""}>
                  <div className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 cursor-pointer"
                    onClick={() => r.hasActivity && toggleExpand(r.teacher.id)}>
                    <div className="flex-1 flex items-center gap-4 flex-wrap">
                      <span className="font-semibold text-slate-800 w-20">{r.teacher.name}</span>
                      <span className="text-sm text-slate-500">{r.regularHours > 0 ? `正課 ${r.regularHours}h` : ""}</span>
                      {r.subHours > 0 && <span className="text-sm text-orange-500">代課 {r.subHours}h</span>}
                      {r.demoHours > 0 && <span className="text-sm text-purple-500">Demo {r.demoHours}h</span>}
                      {r.travelPay > 0 && <span className="text-sm text-slate-400">車費 ${fmt(r.travelPay)}</span>}
                      <span className="font-bold text-blue-700 ml-auto">{r.total > 0 ? `$${fmt(r.total)}` : "—"}</span>
                    </div>
                    <div className="flex items-center gap-2 ml-2" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => sendSalary(r.teacher.id, r.teacher.name)}
                        disabled={sending === r.teacher.id || !r.hasActivity}
                        className="bg-green-500 hover:bg-green-600 text-white text-xs font-medium px-2.5 py-1 rounded-lg transition-colors disabled:opacity-40 whitespace-nowrap"
                      >
                        {sending === r.teacher.id ? "傳送中..." : "傳薪資條"}
                      </button>
                      {r.hasActivity && (
                        <span className="text-slate-400 text-sm w-4 text-center">{expanded.has(r.teacher.id) ? "▲" : "▼"}</span>
                      )}
                    </div>
                  </div>

                  {expanded.has(r.teacher.id) && r.details.length > 0 && (
                    <div className="bg-slate-50 px-4 pb-4">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-xs text-slate-500 border-b border-slate-200">
                            <th className="text-left py-2 font-medium">日期</th>
                            <th className="text-left py-2 font-medium">學校</th>
                            <th className="text-left py-2 font-medium">項目</th>
                            <th className="text-center py-2 font-medium">類別</th>
                            <th className="text-center py-2 font-medium">時數</th>
                            <th className="text-right py-2 font-medium">時薪</th>
                            <th className="text-right py-2 font-medium">車費</th>
                            <th className="text-right py-2 font-medium">金額</th>
                          </tr>
                        </thead>
                        <tbody>
                          {r.details.map((d) => (
                            <tr key={d.id} className="border-b border-slate-100 last:border-0">
                              <td className="py-1.5 text-slate-500">{fmtDate(d.date)}</td>
                              <td className="py-1.5 font-medium">
                                {d.school}
                                {d.isSub && <span className="ml-1 text-xs text-orange-500">代</span>}
                              </td>
                              <td className="py-1.5 text-slate-600">{d.courseType}</td>
                              <td className="py-1.5 text-center">
                                <span className={`text-xs font-medium ${catColor[d.category] ?? "text-slate-500"}`}>{d.category}</span>
                              </td>
                              <td className="py-1.5 text-center">{d.hours}</td>
                              <td className="py-1.5 text-right text-slate-500">${d.rate}</td>
                              <td className="py-1.5 text-right text-slate-400">{d.travelFee > 0 ? `$${d.travelFee}` : "—"}</td>
                              <td className="py-1.5 text-right font-medium">${fmt(d.amount)}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="border-t-2 border-slate-300 font-bold">
                            <td colSpan={7} className="pt-2 text-right text-slate-700">本月合計</td>
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
