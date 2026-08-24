"use client";

import { useMemo, useState } from "react";

type Result = {
  mode?: string;
  error?: string;
  matchedCount?: number;
  willChangeCount?: number;
  updatedCount?: number;
  unmatched?: string[];
  ambiguous?: Array<{ name: string; teacherIds: number[] }>;
};

export default function PayoutHistoryImportPage() {
  const [payoutMonth, setPayoutMonth] = useState("2026-07");
  const [sourceLabel, setSourceLabel] = useState("salary-2026-07.xlsx／2026年7月薪資");
  const [namesText, setNamesText] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const names = useMemo(() => namesText.split(/\r?\n|、/).map((name) => name.trim()).filter(Boolean), [namesText]);

  async function submit(execute: boolean) {
    if (execute && !confirm(`確定依「${sourceLabel}」將 ${names.length} 位老師標記為 ${payoutMonth} 已發薪？`)) return;
    setLoading(true);
    try {
      const res = await fetch("/api/salary/payout-history-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payoutMonth,
          sourceLabel,
          teacherNames: names,
          ...(execute ? { confirm: "import-verified-payroll-history" } : {}),
        }),
      });
      const json = await res.json().catch(() => ({}));
      setResult(json);
      if (!res.ok) throw new Error(json.error || "核對失敗");
    } catch (error) {
      if (!(error instanceof Error && result?.error === error.message)) alert(error instanceof Error ? error.message : "核對失敗");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl p-6 md:p-10">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">匯入歷史已發薪名單</h1>
        <p className="mt-2 text-sm text-slate-500">先預覽核對；姓名全部唯一吻合後才會寫入，既有較早或較新的紀錄會保留。</p>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <label className="text-sm font-medium text-slate-700">發薪月份
            <input type="month" value={payoutMonth} onChange={(event) => setPayoutMonth(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3" />
          </label>
          <label className="text-sm font-medium text-slate-700">核對來源
            <input value={sourceLabel} onChange={(event) => setSourceLabel(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3" />
          </label>
        </div>
        <label className="mt-4 block text-sm font-medium text-slate-700">已發薪老師（每行一位）
          <textarea value={namesText} onChange={(event) => { setNamesText(event.target.value); setResult(null); }} rows={16} className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 font-mono text-sm" />
        </label>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button disabled={loading || names.length === 0} onClick={() => void submit(false)} className="rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white disabled:opacity-40">先預覽核對</button>
          <button disabled={loading || result?.mode !== "dry-run" || (result?.matchedCount ?? 0) !== names.length} onClick={() => void submit(true)} className="rounded-xl bg-emerald-600 px-5 py-3 font-semibold text-white disabled:opacity-40">確認寫入</button>
          <span className="text-sm text-slate-500">共 {names.length} 位</span>
        </div>
        {result && (
          <div className={`mt-5 rounded-xl p-4 text-sm ${result.error ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-800"}`}>
            {result.error ? <p className="font-semibold">{result.error}</p> : result.mode === "executed" ? <p className="font-semibold">完成：核對 {result.matchedCount} 位，更新 {result.updatedCount} 位。</p> : <p className="font-semibold">預覽通過：{result.matchedCount} 位全部唯一吻合，其中 {result.willChangeCount} 位需要更新。</p>}
            {(result.unmatched?.length ?? 0) > 0 && <p className="mt-2">找不到：{result.unmatched!.join("、")}</p>}
            {(result.ambiguous?.length ?? 0) > 0 && <p className="mt-2">同名：{result.ambiguous!.map((row) => `${row.name}（ID ${row.teacherIds.join("/")}）`).join("、")}</p>}
          </div>
        )}
      </div>
    </main>
  );
}
