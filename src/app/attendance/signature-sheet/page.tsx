"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { courseLabel } from "@/lib/courseMeta";

// 安親班課程回報簽名核對表（單一園所整月）：A4 列印版面，可用瀏覽器「列印 → 另存為 PDF」下載。

type Row = {
  id: number;
  date: string;
  cancelled: boolean;
  hours: number;
  studentCount: number | null;
  reportContent: string;
  scheduledTime?: string | null;
  schoolVerifierName?: string;
  schoolSignatureData?: string;
  schoolSignedAt?: string | null;
  course: { school: string; courseType: string; time: string };
  actualTeacher: { name: string };
};

function fmtDate(d: string) {
  const day = d.slice(0, 10);
  const date = new Date(`${day}T00:00:00`);
  const weekday = ["日", "一", "二", "三", "四", "五", "六"][date.getDay()];
  return `${Number(day.slice(5, 7))}/${Number(day.slice(8, 10))}（${weekday}）`;
}

function progressSummary(content: string) {
  const text = (content || "").trim();
  if (!text) return "";
  const match = text.split("\n").find((line) => line.includes("課程進度") || line.includes("訓練內容"));
  const picked = (match ?? text.split("\n")[0]).replace(/^(課程進度|訓練內容)[：:]\s*/, "").trim();
  return picked.length > 40 ? `${picked.slice(0, 40)}…` : picked;
}

function SignatureSheetContent() {
  const searchParams = useSearchParams();
  const school = searchParams.get("school") ?? "";
  const year = Number(searchParams.get("year") ?? new Date().getFullYear());
  const month = Number(searchParams.get("month") ?? new Date().getMonth() + 1);
  const dept = searchParams.get("dept") ?? "";
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!school) { setError("缺少園所參數，請從出勤管理頁選擇園所後再匯出"); setLoading(false); return; }
    const params = new URLSearchParams({ year: String(year), month: String(month), school });
    if (dept) params.set("dept", dept);
    fetch(`/api/attendance?${params}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`資料載入失敗（${res.status}）`);
        const data = await res.json();
        const items: Row[] = Array.isArray(data) ? data : data.items ?? [];
        setRows(items.filter((row) => !row.cancelled).sort((a, b) => a.date.localeCompare(b.date)));
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [school, year, month, dept]);

  const signedCount = rows.filter((row) => row.schoolSignatureData).length;

  if (loading) return <div className="p-10 text-center text-slate-500">核對表載入中…</div>;
  if (error) return <div className="p-10 text-center text-rose-600">{error}</div>;

  return (
    <div className="mx-auto max-w-[210mm] bg-white p-8 text-slate-900 print:p-0">
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 12mm; }
          .no-print { display: none !important; }
          body { background: #fff !important; }
        }
      `}</style>

      <div className="no-print mb-6 flex items-center justify-between rounded-xl bg-blue-50 p-4">
        <div className="text-sm text-blue-900">按下「下載 PDF」後，在列印視窗選擇「另存為 PDF」即可存檔。</div>
        <button type="button" onClick={() => window.print()} className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-bold text-white hover:bg-blue-700">
          下載 PDF / 列印
        </button>
      </div>

      <header className="border-b-2 border-slate-800 pb-3">
        <h1 className="text-xl font-black">WaysLeader 課程回報簽名核對表</h1>
        <div className="mt-2 flex flex-wrap gap-x-8 gap-y-1 text-sm">
          <span>園所：<strong>{school}</strong></span>
          <span>月份：<strong>{year} 年 {month} 月</strong></span>
          <span>堂數：<strong>{rows.length}</strong> 堂（已簽 {signedCount} 堂）</span>
        </div>
      </header>

      {rows.length === 0 ? (
        <p className="py-10 text-center text-slate-500">本月份無上課紀錄。</p>
      ) : (
        <table className="mt-4 w-full border-collapse text-xs" style={{ pageBreakInside: "auto" }}>
          <thead>
            <tr className="border-b-2 border-slate-700 text-left">
              <th className="py-2 pr-2">日期</th>
              <th className="py-2 pr-2">課程</th>
              <th className="py-2 pr-2">老師</th>
              <th className="py-2 pr-2">時數</th>
              <th className="py-2 pr-2">人數</th>
              <th className="py-2 pr-2">課程進度</th>
              <th className="py-2" style={{ width: "150px" }}>園所簽名確認</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-slate-200 align-top" style={{ pageBreakInside: "avoid" }}>
                <td className="py-2 pr-2 whitespace-nowrap">{fmtDate(row.date)}</td>
                <td className="py-2 pr-2">{courseLabel(row.course.courseType)}{row.scheduledTime || row.course.time ? `｜${row.scheduledTime || row.course.time}` : ""}</td>
                <td className="py-2 pr-2 whitespace-nowrap">{row.actualTeacher.name}</td>
                <td className="py-2 pr-2 whitespace-nowrap">{row.hours}h</td>
                <td className="py-2 pr-2 whitespace-nowrap">{row.studentCount ?? "—"}</td>
                <td className="py-2 pr-2">{progressSummary(row.reportContent) || "—"}</td>
                <td className="py-1">
                  {row.schoolSignatureData ? (
                    <div>
                      <img src={row.schoolSignatureData} alt="園所簽名" className="h-12 w-full object-contain object-left" />
                      <div className="mt-0.5 text-[10px] leading-4 text-slate-500">
                        {row.schoolVerifierName || "園所老師"}
                        {row.schoolSignedAt ? `｜${new Date(row.schoolSignedAt).toLocaleDateString("zh-TW")}` : ""}
                      </div>
                    </div>
                  ) : (
                    <div className="h-12 rounded border border-dashed border-slate-300" />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <footer className="mt-8 grid grid-cols-2 gap-10 text-sm" style={{ pageBreakInside: "avoid" }}>
        <div>
          <div className="mb-10 font-bold">園所主管簽章：</div>
          <div className="border-t border-slate-400 pt-1 text-xs text-slate-500">簽章／日期</div>
        </div>
        <div>
          <div className="mb-10 font-bold">公司行政簽章：</div>
          <div className="border-t border-slate-400 pt-1 text-xs text-slate-500">簽章／日期</div>
        </div>
      </footer>
    </div>
  );
}

export default function SignatureSheetPage() {
  return (
    <Suspense fallback={<div className="p-10 text-center text-slate-500">核對表載入中…</div>}>
      <SignatureSheetContent />
    </Suspense>
  );
}
