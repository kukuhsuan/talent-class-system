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

      <BankHeldOfflineSection />
    </main>
  );
}

type OfflineMatch = {
  teacherId: number;
  name: string;
  hasBankInSystem: boolean;
  alreadyMarked: boolean;
  markedBy: string;
  markedAt: string;
};

type OfflineDryRun = {
  inputCount: number;
  matched: OfflineMatch[];
  unmatched: string[];
};

// 名單批次註記「匯款資料在會計端」。
// 沒有這一步，系統上線前就在匯款的老師會被當成缺資料，每個月擋一次。
function BankHeldOfflineSection() {
  const [names, setNames] = useState("");
  const [note, setNote] = useState("");
  const [dry, setDry] = useState<OfflineDryRun | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function post(body: Record<string, unknown>) {
    const res = await fetch("/api/salary/bank-held-offline", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ names, note, ...body }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "操作失敗");
    return json;
  }

  async function run(fn: () => Promise<string>) {
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      setMessage(await fn());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const preview = () => run(async () => {
    const json = (await post({})) as OfflineDryRun;
    setDry(json);
    // 已經註記過的預設不再勾，避免無意義地覆蓋原本的註記人與時間
    setPicked(new Set(json.matched.filter((row) => !row.alreadyMarked).map((row) => row.teacherId)));
    return `配對完成：${json.matched.length} 位對得上、${json.unmatched.length} 個名字在系統中找不到。`;
  });

  const execute = () => {
    if (picked.size === 0) return setError("請至少勾選一位老師");
    if (!confirm(`確定將 ${picked.size} 位老師註記為「匯款資料在會計端」？\n這些人之後不會再出現發薪前的缺資料提醒，註記者會記在操作歷程。`)) return;
    return run(async () => {
      const json = await post({ confirm: "mark-bank-held-offline", teacherIds: [...picked] });
      setDry(null);
      setPicked(new Set());
      return `已註記 ${json.markedCount} 位老師（註記者：${json.markedBy || "—"}）。`;
    });
  };

  return (
    <section className="mt-10 border-t border-slate-200 pt-8">
      <h2 className="text-lg font-bold text-slate-800">🗂️ 匯款資料在會計端（批次註記）</h2>
      <p className="mt-1 text-sm text-slate-500">
        系統上線前就在匯款的老師，帳號與存摺一直在會計手上。把名單貼進來註記後，
        這些人不會再被當成「缺少銀行帳號／尚未上傳存摺」擋下來，畫面會顯示「匯款資料在會計端」並附上是誰、什麼時候註記的。
        新加入的老師不受影響，仍然要走上傳存摺流程。
      </p>

      {error && <div className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>}
      {message && <div className="mt-4 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">{message}</div>}

      <label className="mt-4 block text-sm font-medium text-slate-700">
        老師姓名（一行一個，或用逗號分隔）
        <textarea
          value={names}
          onChange={(event) => setNames(event.target.value)}
          rows={6}
          placeholder={"王小明\n李小華"}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </label>

      <label className="mt-3 block text-sm font-medium text-slate-700">
        依據（會寫進操作歷程，例如「2026-07 會計提供的帳戶名單」）
        <input
          value={note}
          onChange={(event) => setNote(event.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </label>

      <div className="mt-3 flex gap-3">
        <button onClick={preview} disabled={busy || !names.trim()} className="rounded-lg bg-slate-200 px-4 py-2 text-sm font-medium text-slate-700 disabled:opacity-60">
          {busy ? "處理中..." : "試算配對"}
        </button>
        {dry && (
          <button onClick={execute} disabled={busy} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            執行註記（{picked.size} 位）
          </button>
        )}
      </div>

      {dry && (
        <div className="mt-4 space-y-4">
          {dry.unmatched.length > 0 && (
            <div className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
              以下 {dry.unmatched.length} 個名字在系統中找不到對應老師（可能是打錯字、還沒建檔或已離職）：{dry.unmatched.join("、")}
            </div>
          )}
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="w-12 px-4 py-3"></th>
                  <th className="px-4 py-3 text-left font-semibold">老師</th>
                  <th className="px-4 py-3 text-left font-semibold">系統內帳號</th>
                  <th className="px-4 py-3 text-left font-semibold">目前註記</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {dry.matched.map((row) => (
                  <tr key={row.teacherId}>
                    <td className="px-4 py-3 text-center">
                      <input
                        type="checkbox"
                        checked={picked.has(row.teacherId)}
                        onChange={() => setPicked((current) => {
                          const next = new Set(current);
                          if (next.has(row.teacherId)) next.delete(row.teacherId); else next.add(row.teacherId);
                          return next;
                        })}
                        className="h-4 w-4"
                      />
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-800">{row.name}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{row.hasBankInSystem ? "已有完整帳號" : "未填"}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {row.alreadyMarked ? `已註記（${row.markedBy || "—"}）` : "—"}
                    </td>
                  </tr>
                ))}
                {dry.matched.length === 0 && (
                  <tr><td colSpan={4} className="py-8 text-center text-slate-400">沒有對得上的老師</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
