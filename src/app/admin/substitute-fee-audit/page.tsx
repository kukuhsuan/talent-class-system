"use client";
import { useCallback, useEffect, useState } from "react";

type Record = {
  substituteId: number;
  attendanceId: number | null;
  date: string;
  school: string;
  courseType: string;
  role: string;
  teacher: string;
  category: string;
  hours: number;
  rate: number;
  paidBefore: number;
  correctPay: number;
  difference: number;
  cancelled: boolean;
  payrollLocked: boolean;
  notes: string;
};

type Audit = { total: number; underpaid: number; overpaid: number; records: Record[] };

const money = (value: number) => `$${value.toLocaleString("en-US")}`;

export default function SubstituteFeeAuditPage() {
  const [data, setData] = useState<Audit | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/substitute-fee-audit", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "載入失敗");
      setData(json);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { queueMicrotask(() => { void load(); }); }, [load]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-800">代課費影響薪資稽核</h1>
        <p className="mt-1 text-sm text-slate-500">
          修正前的計薪邏輯只要代課記錄填了「代課費」，就會用那個數字取代整堂應發薪資（填 1 就發 1 元）。
          這裡列出所有已確認且填了代課費的代課記錄，供核對先前月份是否發錯。修正後代課費純屬備註，不再影響計薪。
        </p>
      </div>

      {loading && <p className="text-sm text-slate-500">載入中…</p>}
      {error && <p className="text-sm text-red-500">{error}</p>}

      {data && data.total === 0 && (
        <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
          沒有任何已確認的代課記錄填了代課費，先前月份不受影響。
        </p>
      )}

      {data && data.total > 0 && (
        <>
          <div className="mb-4 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg bg-slate-50 p-3">
              <div className="text-lg font-bold text-slate-700">{data.total}</div>
              <div className="text-xs text-slate-500">受影響記錄</div>
            </div>
            <div className="rounded-lg bg-red-50 p-3">
              <div className="text-lg font-bold text-red-600">{data.underpaid}</div>
              <div className="text-xs text-slate-500">少發（需補）</div>
            </div>
            <div className="rounded-lg bg-amber-50 p-3">
              <div className="text-lg font-bold text-amber-600">{data.overpaid}</div>
              <div className="text-xs text-slate-500">多發</div>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full min-w-[840px] text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left">日期</th>
                  <th className="px-3 py-2 text-left">老師</th>
                  <th className="px-3 py-2 text-left">學校／課程</th>
                  <th className="px-3 py-2 text-left">身份</th>
                  <th className="px-3 py-2 text-right">時數×時薪</th>
                  <th className="px-3 py-2 text-right">原本發出</th>
                  <th className="px-3 py-2 text-right">應發</th>
                  <th className="px-3 py-2 text-right">差額</th>
                </tr>
              </thead>
              <tbody>
                {data.records.map((row) => (
                  <tr key={row.substituteId} className="border-t border-slate-100">
                    <td className="px-3 py-2 whitespace-nowrap text-slate-600">{row.date}</td>
                    <td className="px-3 py-2 whitespace-nowrap font-medium text-slate-800">{row.teacher}</td>
                    <td className="px-3 py-2 text-slate-600">
                      {row.school}｜{row.courseType}
                      {row.cancelled && <span className="ml-1 rounded bg-slate-100 px-1 text-[10px] text-slate-500">已停課</span>}
                      {row.payrollLocked && <span className="ml-1 rounded bg-slate-100 px-1 text-[10px] text-slate-500">已鎖薪</span>}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-slate-600">{row.role}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-right text-slate-500">{row.hours}h × {money(row.rate)}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-right text-slate-600">{money(row.paidBefore)}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-right font-medium text-slate-800">{money(row.correctPay)}</td>
                    <td className={`px-3 py-2 whitespace-nowrap text-right font-bold ${row.difference > 0 ? "text-red-600" : row.difference < 0 ? "text-amber-600" : "text-slate-400"}`}>
                      {row.difference > 0 ? "+" : ""}{money(row.difference)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-3 text-xs text-slate-500">
            「應發」為時數 × 時薪的概算，不含車費與薪資調整，也未套用行政單堂改過的計薪時數；
            確切金額請以薪資頁為準。核對完這批資料後這頁可以移除。
          </p>
        </>
      )}
    </div>
  );
}
