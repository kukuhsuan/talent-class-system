"use client";

import { useCallback, useEffect, useState } from "react";

type Proposal = {
  teacherId: number;
  name: string;
  currentFirstPaidMonth: string;
  currentLastPaidMonth: string;
  firstPaidMonth: string;
  lastPaidMonth: string;
  paidMonthCount: number;
  willChange: boolean;
};

type DryRun = {
  payrollRunCount: number;
  teacherWithPayoutCount: number;
  willChangeCount: number;
  note: string;
  proposals: Proposal[];
};

export default function PayoutBaselineBackfillPage() {
  const [data, setData] = useState<DryRun | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/salary/payout-baseline", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "試算失敗");
      setData(json as DryRun);
      // 預設勾選所有需要變更的人，會計只要取消掉例外即可
      setPicked(new Set((json.proposals as Proposal[]).filter((row) => row.willChange).map((row) => row.teacherId)));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function execute() {
    if (picked.size === 0) return setError("請至少勾選一位老師");
    if (!confirm(`確定將 ${picked.size} 位老師的匯款基準線寫入資料庫？此動作會記錄在操作歷程。`)) return;
    setRunning(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/salary/payout-baseline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: "backfill-payout-baseline", teacherIds: [...picked] }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "回填失敗");
      setMessage(`已回填 ${json.updatedCount} 位老師的匯款基準線。`);
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRunning(false);
    }
  }

  const toggle = (id: number) => setPicked((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  return (
    <main className="mx-auto max-w-5xl">
      <div className="mb-4">
        <h1 className="text-xl font-bold text-slate-800">💰 匯款基準線回填</h1>
        <p className="mt-1 text-sm text-slate-500">
          從已結算鎖定的薪資快照，倒推每位老師「第一次／最後一次被算到薪水」的月份，寫進老師資料。
          不做這一步，發薪頁第一個月會對所有老師跳「首次匯款」的假警報。
        </p>
      </div>

      {error && <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>}
      {message && <div className="mb-4 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">{message}</div>}

      {loading && <div className="py-10 text-center text-slate-400">試算中...</div>}

      {!loading && data && (
        <>
          <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
              <div className="text-xs text-slate-400">薪資快照月份</div>
              <div className="text-lg font-semibold text-slate-800">{data.payrollRunCount}</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
              <div className="text-xs text-slate-400">有匯款紀錄的老師</div>
              <div className="text-lg font-semibold text-slate-800">{data.teacherWithPayoutCount}</div>
            </div>
            <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
              <div className="text-xs text-blue-500">本次需寫入</div>
              <div className="text-lg font-semibold text-blue-700">{data.willChangeCount}</div>
            </div>
          </div>

          <div className="mb-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">{data.note}</div>

          <div className="mb-4 flex gap-3">
            <button onClick={() => void load()} disabled={running} className="rounded-lg bg-slate-200 px-4 py-2 text-sm font-medium text-slate-700 disabled:opacity-60">重新試算</button>
            <button onClick={execute} disabled={running || data.willChangeCount === 0} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
              {running ? "寫入中..." : `執行回填（${picked.size} 位）`}
            </button>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="w-12 px-4 py-3"></th>
                  <th className="px-4 py-3 text-left font-semibold">老師</th>
                  <th className="px-4 py-3 text-left font-semibold">目前紀錄</th>
                  <th className="px-4 py-3 text-left font-semibold">將寫入</th>
                  <th className="px-4 py-3 text-center font-semibold">有薪月數</th>
                  <th className="px-4 py-3 text-center font-semibold">狀態</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.proposals.map((row) => (
                  <tr key={row.teacherId} className={row.willChange ? "" : "opacity-60"}>
                    <td className="px-4 py-3 text-center">
                      <input type="checkbox" disabled={!row.willChange} checked={picked.has(row.teacherId)} onChange={() => toggle(row.teacherId)} className="h-4 w-4" />
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-800">{row.name}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {row.currentFirstPaidMonth || row.currentLastPaidMonth
                        ? `${row.currentFirstPaidMonth || "—"} ～ ${row.currentLastPaidMonth || "—"}`
                        : "無紀錄"}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-700">{row.firstPaidMonth} ～ {row.lastPaidMonth}</td>
                    <td className="px-4 py-3 text-center text-slate-600">{row.paidMonthCount}</td>
                    <td className="px-4 py-3 text-center">
                      {row.willChange
                        ? <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700">待寫入</span>
                        : <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">已一致</span>}
                    </td>
                  </tr>
                ))}
                {data.proposals.length === 0 && (
                  <tr><td colSpan={6} className="py-8 text-center text-slate-400">沒有可回填的資料</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </main>
  );
}
