"use client";
import { useEffect, useState } from "react";

type Teacher = { id: number; name: string; rateAfterSchool: number; travelFee: number };
type SalaryRow = {
  teacher: Teacher;
  regularHours: number;
  subHours: number;
  demoHours: number;
  regularPay: number;
  demoPay: number;
  travelPay: number;
  total: number;
  hasActivity: boolean;
};

export default function SalaryPage() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [data, setData] = useState<{ year: number; month: number; results: SalaryRow[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const load = async () => {
    setLoading(true);
    const res = await fetch(`/api/salary?year=${year}&month=${month}`);
    const json = await res.json();
    setData(json);
    setLoading(false);
  };

  useEffect(() => { load(); }, [year, month]);

  const active = data?.results.filter((r) => r.hasActivity) ?? [];
  const displayed = showAll ? (data?.results ?? []) : active;
  const grandTotal = active.reduce((s, r) => s + r.total, 0);

  const fmt = (n: number) => n.toLocaleString("zh-TW");

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-800">💰 月薪資計算</h1>
          <p className="text-sm text-slate-500">自動彙整各老師當月應付薪資</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 mb-6">
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">年份</label>
            <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-24">
              {[2025, 2026, 2027].map((y) => <option key={y}>{y}</option>)}
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
          <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer ml-auto">
            <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} className="w-4 h-4" />
            顯示當月無課老師
          </label>
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
              <p className="text-2xl font-bold text-orange-800">
                {active.reduce((s, r) => s + r.subHours, 0)} 節
              </p>
            </div>
            <div className="bg-purple-50 rounded-xl border border-purple-200 p-4">
              <p className="text-sm text-purple-600 font-medium">本月薪資總計</p>
              <p className="text-2xl font-bold text-purple-800">${fmt(grandTotal)}</p>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center">
              <span className="font-semibold text-slate-700">{year}年 {month}月 薪資明細</span>
              <div className="flex gap-2">
              <button onClick={() => {
                const rows = displayed.filter((r) => r.hasActivity);
                const csv = [
                  ["老師姓名","正課節數","代課節數","Demo節數","正課薪資","Demo薪資","車費","應付總計"].join(","),
                  ...rows.map((r) => [r.teacher.name,r.regularHours,r.subHours,r.demoHours,r.regularPay,r.demoPay,r.travelPay,r.total].join(","))
                ].join("\n");
                const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url; a.download = `薪資_${year}${String(month).padStart(2,"0")}.csv`;
                a.click(); URL.revokeObjectURL(url);
              }} className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium px-3 py-1.5 rounded-lg text-sm transition-colors">
                匯出 CSV
              </button>
              <a href={`/api/export/salary?year=${year}&month=${month}`} download
                className="bg-green-600 hover:bg-green-700 text-white font-medium px-3 py-1.5 rounded-lg text-sm transition-colors">
                匯出 Excel
              </a>
            </div>
            </div>
            <div className="overflow-x-auto">
              <table>
                <thead>
                  <tr>
                    <th>老師姓名</th>
                    <th className="text-center">正課節數</th>
                    <th className="text-center">代課節數</th>
                    <th className="text-center">Demo節數</th>
                    <th className="text-center">時薪</th>
                    <th className="text-right">正課薪資</th>
                    <th className="text-right">Demo薪資</th>
                    <th className="text-right">車費</th>
                    <th className="text-right font-bold">應付總計</th>
                  </tr>
                </thead>
                <tbody>
                  {displayed.map((r) => (
                    <tr key={r.teacher.id} className={!r.hasActivity ? "opacity-40" : ""}>
                      <td className="font-medium">{r.teacher.name}</td>
                      <td className="text-center">{r.regularHours || "-"}</td>
                      <td className="text-center">{r.subHours > 0 ? <span className="text-orange-600 font-medium">{r.subHours}</span> : "-"}</td>
                      <td className="text-center">{r.demoHours > 0 ? <span className="text-purple-600">{r.demoHours}</span> : "-"}</td>
                      <td className="text-center text-slate-500">${r.teacher.rateAfterSchool}</td>
                      <td className="text-right">{r.regularPay > 0 ? `$${fmt(r.regularPay)}` : "-"}</td>
                      <td className="text-right">{r.demoPay > 0 ? `$${fmt(r.demoPay)}` : "-"}</td>
                      <td className="text-right">{r.travelPay > 0 ? `$${fmt(r.travelPay)}` : "-"}</td>
                      <td className="text-right font-bold text-blue-700">{r.total > 0 ? `$${fmt(r.total)}` : "-"}</td>
                    </tr>
                  ))}
                  {active.length > 0 && (
                    <tr className="bg-slate-50 font-bold">
                      <td>合計</td>
                      <td className="text-center">{active.reduce((s, r) => s + r.regularHours, 0)}</td>
                      <td className="text-center">{active.reduce((s, r) => s + r.subHours, 0)}</td>
                      <td className="text-center">{active.reduce((s, r) => s + r.demoHours, 0)}</td>
                      <td></td>
                      <td className="text-right">${fmt(active.reduce((s, r) => s + r.regularPay, 0))}</td>
                      <td className="text-right">${fmt(active.reduce((s, r) => s + r.demoPay, 0))}</td>
                      <td className="text-right">${fmt(active.reduce((s, r) => s + r.travelPay, 0))}</td>
                      <td className="text-right text-blue-700">${fmt(grandTotal)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
