"use client";

import { useState } from "react";

type Result = {
  error?: string;
  applied?: number;
  summary?: { sourceRows: number; matched: number; unmatched: number; ambiguous: number };
  matched?: Array<{ schoolName: string; sourceName: string; invoiceTitle: string; taxId: string; billingEmail: string }>;
  unmatched?: Array<{ sourceName: string; candidates: string[] }>;
  ambiguous?: Array<{ sourceName: string; candidates: string[] }>;
};

export default function BillingImportPage() {
  const [payload, setPayload] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(apply: boolean) {
    setLoading(true);
    try {
      const rows = JSON.parse(payload);
      const response = await fetch("/api/admin/billing-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows, apply }),
      });
      setResult(await response.json());
    } catch (error) {
      setResult({ error: error instanceof Error ? error.message : "資料格式錯誤" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-5xl p-6">
      <h1 className="text-2xl font-black text-slate-900">臨時請款資料匯入</h1>
      <p className="mt-1 text-sm text-slate-500">最高權限專用；先預覽配對，再寫入唯一匹配的園所。</p>
      <textarea
        value={payload}
        onChange={(event) => setPayload(event.target.value)}
        className="mt-5 h-56 w-full rounded-xl border border-slate-300 p-4 font-mono text-xs"
        placeholder="貼上 JSON 陣列"
      />
      <div className="mt-3 flex gap-3">
        <button disabled={loading || !payload} onClick={() => submit(false)} className="rounded-lg bg-blue-600 px-4 py-2 font-bold text-white disabled:opacity-40">
          預覽配對
        </button>
        <button disabled={loading || !payload || !result?.summary} onClick={() => submit(true)} className="rounded-lg bg-emerald-600 px-4 py-2 font-bold text-white disabled:opacity-40">
          寫入已配對資料
        </button>
      </div>
      {result && (
        <section className="mt-5 rounded-xl border border-slate-200 bg-white p-5">
          {result.error ? <p className="font-bold text-red-600">{result.error}</p> : (
            <>
              <p className="font-bold text-slate-800">
                來源 {result.summary?.sourceRows} 筆｜配對 {result.summary?.matched}｜未配對 {result.summary?.unmatched}｜重複 {result.summary?.ambiguous}
                {result.applied ? `｜已寫入 ${result.applied}` : ""}
              </p>
              <pre className="mt-4 max-h-[520px] overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-4 text-xs text-slate-700">
                {JSON.stringify(result, null, 2)}
              </pre>
            </>
          )}
        </section>
      )}
    </main>
  );
}
