"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { courseLabel } from "@/lib/courseMeta";

// 單堂課電子簽到表：A4 直式，可列印或另存 PDF 給合作單位留存，作為當日課程與出席人數證明。

type SheetData = {
  id: number;
  date: string;
  cancelled: boolean;
  hours: number;
  studentCount: number | null;
  scheduledTime: string;
  course: { school: string; courseType: string; time: string };
  actualTeacher: { name: string };
  schoolVerifierName: string;
  schoolSignatureData: string;
  schoolSignedAt: string | null;
};

function fmtDate(d: string) {
  const day = d.slice(0, 10);
  const date = new Date(`${day}T00:00:00`);
  const weekday = ["日", "一", "二", "三", "四", "五", "六"][date.getDay()];
  return `${day.slice(0, 4)} 年 ${Number(day.slice(5, 7))} 月 ${Number(day.slice(8, 10))} 日（星期${weekday}）`;
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex border-b border-slate-300 py-3 text-[15px]">
      <div className="w-44 shrink-0 font-bold">{label}</div>
      <div className="flex-1">{value || "—"}</div>
    </div>
  );
}

function SignInSheetContent() {
  const searchParams = useSearchParams();
  const id = searchParams.get("id") ?? "";
  const [data, setData] = useState<SheetData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) { setError("缺少上課紀錄編號"); return; }
    fetch(`/api/attendance/${id}`)
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? `載入失敗（${res.status}）`);
        setData(json);
      })
      .catch((e) => setError((e as Error).message));
  }, [id]);

  if (error) return <div className="p-10 text-center text-rose-600">{error}</div>;
  if (!data) return <div className="p-10 text-center text-slate-500">簽到表載入中…</div>;

  const timeText = data.scheduledTime || data.course.time || "";
  const countText = data.studentCount !== null ? `${data.studentCount} 位` : "";
  const signedDate = data.schoolSignedAt ? new Date(data.schoolSignedAt).toLocaleDateString("zh-TW") : "";

  return (
    <div className="mx-auto max-w-[210mm] bg-white p-10 text-slate-900 print:p-0">
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 18mm; }
          .no-print { display: none !important; }
          body { background: #fff !important; }
        }
      `}</style>

      <div className="no-print mb-6 flex items-center justify-between rounded-xl bg-blue-50 p-4">
        <div className="text-sm text-blue-900">按「下載 PDF / 列印」後，可直接列印或選擇「另存為 PDF」。</div>
        <button type="button" onClick={() => window.print()} className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-bold text-white hover:bg-blue-700">
          下載 PDF / 列印
        </button>
      </div>

      <header className="border-b-4 border-slate-800 pb-4 text-center">
        <h1 className="text-2xl font-black tracking-widest">課程簽到表</h1>
        <p className="mt-1 text-sm text-slate-500">WaysLeader — 本表為當日課程執行與出席人數證明，請合作單位留存</p>
      </header>

      <section className="mt-8">
        <InfoRow label="合作單位／上課地點" value={data.course.school} />
        <InfoRow label="課程名稱" value={courseLabel(data.course.courseType)} />
        <InfoRow label="上課日期" value={fmtDate(data.date)} />
        <InfoRow label="上課時間" value={timeText} />
        <InfoRow label="實際上課人數" value={countText ? `${countText}` : "＿＿＿＿ 位（請由簽名老師填寫確認）"} />
        <InfoRow label="授課教練" value={data.actualTeacher.name} />
        {data.cancelled && <InfoRow label="狀態" value="本堂課已停課" />}
      </section>

      <section className="mt-14" style={{ pageBreakInside: "avoid" }}>
        <h2 className="text-base font-black">合作單位老師簽名確認</h2>
        <p className="mt-1 text-sm text-slate-600">茲確認上列課程於當日確實執行，出席人數無誤。<strong>請以正楷簽署本名。</strong></p>

        <div className="mt-6 grid grid-cols-[1fr_240px] gap-8">
          <div>
            <div className="flex h-32 items-end rounded-xl border border-slate-400 p-3">
              {data.schoolSignatureData
                ? <img src={data.schoolSignatureData} alt="合作單位老師簽名" className="h-full w-full object-contain object-left-bottom" />
                : <span className="text-xs text-slate-400">簽名處（請以正楷簽署本名）</span>}
            </div>
            <div className="mt-1 text-xs text-slate-500">
              合作單位老師簽名{data.schoolVerifierName ? `：${data.schoolVerifierName}` : ""}
            </div>
          </div>
          <div className="flex flex-col justify-end gap-6 text-sm">
            <div>
              <div className="border-b border-slate-400 pb-1">{signedDate || ""}</div>
              <div className="mt-1 text-xs text-slate-500">日期</div>
            </div>
            <div>
              <div className="border-b border-slate-400 pb-1">{countText || ""}</div>
              <div className="mt-1 text-xs text-slate-500">實際上課人數</div>
            </div>
          </div>
        </div>
      </section>

      <footer className="mt-16 border-t border-slate-300 pt-3 text-center text-xs text-slate-400">
        本簽到表由 WaysLeader 系統產出，簽名完成後自動儲存於該堂課紀錄，可隨時查詢、下載與重新列印。
      </footer>
    </div>
  );
}

export default function SignInSheetPage() {
  return (
    <Suspense fallback={<div className="p-10 text-center text-slate-500">簽到表載入中…</div>}>
      <SignInSheetContent />
    </Suspense>
  );
}
