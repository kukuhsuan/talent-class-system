"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

type PortalData = {
  school: { name: string; type: string; region: string; address: string; contact: string; phone: string };
  year: number;
  month: number;
  summary: { reports: number; lessons: number; totalPeople: number; assessments: number };
  reports: Array<{
    id: number; date: string; courseName: string; department: string; category: string; time: string; teacherName: string;
    studentCount: number; reportContent: string; skillFocus: string; classStatus: string; incident: boolean;
    incidentChild: string; incidentProcess: string; incidentAction: string; incidentNotified: string;
    aiSummary: string; aiSkillFocus: string; aiTeachingNote: string; schoolNotifyStatus: string;
  }>;
  monthlyRows: Array<{ id: number; date: string; courseName: string; teacherName: string; time: string; studentCount: number; reportContent: string }>;
  assessments: Array<{ id: number; childName: string; courseName: string; teacherName: string; date: string; title: string; comment: string; certificateUrl: string }>;
};

export default function SchoolPortalPage() {
  const params = useParams<{ token: string }>();
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [data, setData] = useState<PortalData | null>(null);
  const [tab, setTab] = useState<"reports" | "monthly" | "certificates">("reports");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    setError("");
    fetch(`/api/school-portal/${encodeURIComponent(params.token)}?year=${year}&month=${month}`)
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || "讀取園所資料失敗");
        return body;
      })
      .then(setData)
      .catch((e) => setError((e as Error).message || "讀取園所資料失敗"))
      .finally(() => setLoading(false));
  }, [params.token, year, month]);

  if (error) {
    return <div className="min-h-screen bg-slate-50 px-5 py-16 text-center text-red-500">{error}</div>;
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <header className="bg-[#243E90] px-5 py-6 text-white">
        <div className="mx-auto max-w-5xl">
          <div className="text-xs font-semibold tracking-[0.25em] text-blue-100">UPBEAR SCHOOL PORTAL</div>
          <h1 className="mt-2 text-2xl font-black">園所專屬查看頁</h1>
          <p className="mt-1 text-sm text-blue-100">課程回報、月報表、學期成果證書集中查看</p>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-5">
        {loading || !data ? (
          <div className="rounded-2xl bg-white p-10 text-center text-slate-400 shadow-sm">載入園所資料中...</div>
        ) : (
          <>
            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div>
                  <h2 className="text-2xl font-black text-slate-900">{data.school.name}</h2>
                  <div className="mt-2 flex flex-wrap gap-2 text-sm">
                    <span className="rounded-full bg-blue-50 px-3 py-1 font-semibold text-blue-700">{data.school.type}</span>
                    {data.school.region && <span className="rounded-full bg-emerald-50 px-3 py-1 font-semibold text-emerald-700">{data.school.region}</span>}
                  </div>
                  <div className="mt-3 space-y-1 text-sm text-slate-500">
                    {data.school.address && <p>{data.school.address}</p>}
                    {(data.school.contact || data.school.phone) && <p>{data.school.contact || "聯絡窗口"} {data.school.phone ? `｜${data.school.phone}` : ""}</p>}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
                    {[2025, 2026, 2027].map((y) => <option key={y}>{y}</option>)}
                  </select>
                  <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => <option key={m} value={m}>{m}月</option>)}
                  </select>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
                <SummaryCard label="課程回報" value={data.summary.reports} />
                <SummaryCard label="本月堂數" value={data.summary.lessons} />
                <SummaryCard label="本月總人數" value={data.summary.totalPeople} />
                <SummaryCard label="學期證書" value={data.summary.assessments} />
              </div>
            </section>

            <div className="sticky top-0 z-10 mt-5 flex gap-2 overflow-x-auto bg-[#F8FAFC]/95 py-3 backdrop-blur">
              <TabButton active={tab === "reports"} onClick={() => setTab("reports")}>課程回報</TabButton>
              <TabButton active={tab === "monthly"} onClick={() => setTab("monthly")}>月報表</TabButton>
              <TabButton active={tab === "certificates"} onClick={() => setTab("certificates")}>學期證書</TabButton>
            </div>

            {tab === "reports" && (
              <section className="space-y-4">
                {data.reports.map((row) => (
                  <article key={row.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                      <div>
                        <div className="font-bold text-slate-900">{row.date}｜{row.courseName}</div>
                        <div className="mt-1 text-sm text-slate-500">{row.time || "時間未填"}｜{row.teacherName}｜{row.studentCount || "—"} 人</div>
                      </div>
                      <span className="w-fit rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">{row.schoolNotifyStatus || "已送出"}</span>
                    </div>
                    {(row.reportContent || row.aiSummary || row.aiTeachingNote) && (
                      <div className="mt-4 rounded-xl bg-slate-50 p-4 text-sm leading-7 text-slate-700">
                        {row.reportContent && <p className="font-semibold">課程進度：{row.reportContent}</p>}
                        {row.aiSummary && <p>{row.aiSummary}</p>}
                        {row.aiTeachingNote && <p>{row.aiTeachingNote}</p>}
                      </div>
                    )}
                    <div className="mt-3 grid gap-2 md:grid-cols-3">
                      {row.skillFocus && <InfoBlock title="能力培養" text={row.skillFocus} />}
                      {row.classStatus && <InfoBlock title="課堂狀況" text={row.classStatus} />}
                      {row.incident && <InfoBlock title="特殊事件" text={`${row.incidentChild || "未填孩子"}｜${row.incidentProcess || "未填經過"}｜${row.incidentAction || "未填處理方式"}｜${row.incidentNotified || "未填通知狀態"}`} warning />}
                    </div>
                  </article>
                ))}
                {data.reports.length === 0 && <Empty text="這個月份尚無課程回報。" />}
              </section>
            )}

            {tab === "monthly" && (
              <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-100 p-4 font-bold text-slate-800">本月課程明細</div>
                <div className="divide-y divide-slate-100">
                  {data.monthlyRows.map((row) => (
                    <div key={row.id} className="grid gap-2 p-4 text-sm md:grid-cols-[120px_1fr_120px_100px] md:items-center">
                      <div className="font-semibold text-slate-800">{row.date}</div>
                      <div>
                        <div className="font-semibold text-slate-900">{row.courseName}</div>
                        <div className="text-slate-500">{row.teacherName}｜{row.time || "時間未填"}</div>
                      </div>
                      <div className="font-bold text-blue-700">{row.studentCount} 人</div>
                      <div className="text-slate-400">{row.reportContent ? "已回報" : "未回報"}</div>
                    </div>
                  ))}
                  {data.monthlyRows.length === 0 && <Empty text="這個月份尚無上課紀錄。" />}
                </div>
              </section>
            )}

            {tab === "certificates" && (
              <section className="grid gap-4 md:grid-cols-2">
                {data.assessments.map((row) => (
                  <article key={row.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-lg font-black text-slate-900">{row.childName}</div>
                        <div className="mt-1 text-sm text-slate-500">{row.date}｜{row.courseName}｜{row.teacherName}</div>
                      </div>
                      <span className="rounded-full bg-[#F3E7D0] px-3 py-1 text-xs font-bold text-[#6E4C1E]">{row.title || "成長證書"}</span>
                    </div>
                    <p className="mt-3 line-clamp-3 text-sm leading-6 text-slate-600">{row.comment}</p>
                    <a href={row.certificateUrl} className="mt-4 inline-flex rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white">
                      查看證書
                    </a>
                  </article>
                ))}
                {data.assessments.length === 0 && <Empty text="這個月份尚無學期證書。" />}
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-4">
      <div className="text-xs font-semibold text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-black text-blue-700">{value.toLocaleString("zh-TW")}</div>
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold ${active ? "bg-blue-600 text-white" : "bg-white text-slate-600 border border-slate-200"}`}>
      {children}
    </button>
  );
}

function InfoBlock({ title, text, warning }: { title: string; text: string; warning?: boolean }) {
  return (
    <div className={`rounded-xl p-3 text-sm ${warning ? "bg-amber-50 text-amber-800" : "bg-blue-50 text-blue-800"}`}>
      <div className="font-bold">{title}</div>
      <div className="mt-1 leading-6">{text}</div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center text-slate-400">{text}</div>;
}
