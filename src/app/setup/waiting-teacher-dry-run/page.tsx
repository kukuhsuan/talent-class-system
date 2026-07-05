"use client";

import { useCallback, useEffect, useState } from "react";

export default function WaitingTeacherDryRunPage() {
  const [result, setResult] = useState<unknown>({ loading: true });
  const [repairing, setRepairing] = useState(false);
  const [autoRepairStarted, setAutoRepairStarted] = useState(false);

  const load = useCallback(() => {
    setResult({ loading: true });
    fetch("/api/setup/waiting-teacher-dry-run")
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Dry-run failed");
        return data;
      })
      .then(setResult)
      .catch((error: Error) => setResult({ error: error.message }));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const executeRepair = useCallback(async () => {
    setRepairing(true);
    try {
      const response = await fetch("/api/setup/waiting-teacher-dry-run?summaryOnly=1", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: "repair-all-after-school-waiting-teachers" }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Repair failed");
      setResult(data);
    } catch (error) {
      setResult({ error: (error as Error).message });
    } finally {
      setRepairing(false);
    }
  }, []);

  useEffect(() => {
    const execute = new URLSearchParams(window.location.search).get("execute");
    if (execute === "repair-all-after-school-waiting-teachers" && !autoRepairStarted) {
      setAutoRepairStarted(true);
      void executeRepair();
    }
  }, [autoRepairStarted, executeRepair]);

  const repair = async () => {
    if (!confirm("確定執行全部安親班待排老師正式修復？只會更新仍符合安全條件的 Attendance。")) return;
    await executeRepair();
  };

  return (
    <main className="mx-auto max-w-6xl p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-slate-800">安親班待排老師修復</h1>
        <div className="flex gap-2">
          <button onClick={load} className="rounded-lg bg-slate-200 px-4 py-2 text-sm font-medium text-slate-700">重新掃描</button>
          <button onClick={repair} disabled={repairing} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            {repairing ? "修復中..." : "執行正式修復"}
          </button>
        </div>
      </div>
      <pre className="overflow-auto rounded-lg bg-slate-950 p-4 text-xs text-slate-100">
        {JSON.stringify(result, null, 2)}
      </pre>
    </main>
  );
}
