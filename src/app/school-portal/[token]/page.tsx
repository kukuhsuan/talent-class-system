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
    return <div className="min-h-screen bg-[#FFF7DD] px-5 py-16 text-center text-rose-500">{error}</div>;
  }

  return (
    <div className="min-h-screen bg-[#FFF7DD] text-[#142452]">
      <div className="fixed inset-0 pointer-events-none bg-[radial-gradient(circle_at_72%_7%,rgba(255,210,89,0.45),transparent_24%),radial-gradient(circle_at_86%_84%,rgba(168,216,255,0.65),transparent_28%),linear-gradient(180deg,#FFF4C7_0%,#FFF8E6_31%,#EAF7FF_31%,#F8FBFF_100%)]" />
      <div className="relative mx-auto flex min-h-screen max-w-[1480px] gap-8 px-4 py-5 lg:px-8">
        <aside className="hidden w-[220px] shrink-0 rounded-[28px] bg-white/88 p-4 shadow-[0_20px_60px_rgba(80,93,130,0.16)] ring-1 ring-white/70 lg:sticky lg:top-5 lg:block lg:h-[calc(100vh-40px)]">
          <div className="flex flex-col items-center border-b border-[#F2E6CA] pb-5 pt-3">
            <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-[#FFE1A3] text-3xl shadow-inner">✦</div>
            <div className="mt-3 text-center text-lg font-black text-[#4A2C17]">才藝課管理系統</div>
          </div>
          <nav className="mt-6 space-y-2">
            <SideItem active={false} label="首頁總覽" icon="⌂" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} />
            <SideItem active={tab === "reports"} label="課程回報" icon="▣" onClick={() => setTab("reports")} />
            <SideItem active={tab === "monthly"} label="月報表" icon="▤" onClick={() => setTab("monthly")} />
            <SideItem active={tab === "certificates"} label="學期證書" icon="◇" onClick={() => setTab("certificates")} />
            <SideItem active={false} label="通知中心" icon="!" onClick={() => setTab("reports")} />
          </nav>
          <div className="mt-auto flex h-[230px] items-end justify-center rounded-3xl bg-gradient-to-t from-[#FFF0BE] to-transparent text-center text-sm font-bold text-[#8A6A2E]">
            <div className="mb-6">
              <div className="mx-auto mb-3 h-14 w-14 rounded-full bg-[#FFD569]" />
              園所專屬查看
            </div>
          </div>
        </aside>

        <main className="min-w-0 flex-1 pb-10">
          <div className="mb-5 flex items-center justify-between rounded-3xl bg-white/85 px-4 py-3 shadow-sm ring-1 ring-white/70 lg:hidden">
            <div>
              <div className="text-sm font-black text-[#4A2C17]">才藝課管理系統</div>
              <div className="text-xs text-slate-500">園所專屬查看頁</div>
            </div>
            <div className="flex gap-2 overflow-x-auto">
              <MiniTab active={tab === "reports"} onClick={() => setTab("reports")}>回報</MiniTab>
              <MiniTab active={tab === "monthly"} onClick={() => setTab("monthly")}>月報</MiniTab>
              <MiniTab active={tab === "certificates"} onClick={() => setTab("certificates")}>證書</MiniTab>
            </div>
          </div>

          {loading || !data ? (
            <div className="rounded-[28px] bg-white/90 p-10 text-center text-slate-400 shadow-sm">載入園所資料中...</div>
          ) : (
            <>
              <section className="relative overflow-hidden rounded-[34px] px-5 py-7 md:px-8">
                <div className="absolute right-10 top-8 hidden h-16 w-16 rounded-full bg-[#FFD569] shadow-[0_0_0_18px_rgba(255,213,105,0.25)] md:block" />
                <div className="absolute right-52 top-12 hidden h-9 w-20 rounded-full bg-white/80 md:block" />
                <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
                  <div>
                    <h1 className="text-4xl font-black tracking-tight text-[#142452]">您好！</h1>
                    <p className="mt-3 text-base font-medium text-[#5C4A3E]">歡迎使用才藝課管理系統，這裡是您的學習成果總覽。</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <span className="rounded-full bg-white/80 px-4 py-2 text-sm font-bold text-blue-700 shadow-sm">{data.school.name}</span>
                      <span className="rounded-full bg-white/80 px-4 py-2 text-sm font-bold text-emerald-700 shadow-sm">{data.school.type}</span>
                      {data.school.region && <span className="rounded-full bg-white/80 px-4 py-2 text-sm font-bold text-amber-700 shadow-sm">{data.school.region}</span>}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="rounded-2xl border border-white/80 bg-white/90 px-5 py-3 text-base font-bold shadow-sm outline-none">
                      {[2025, 2026, 2027].map((y) => <option key={y}>{y}</option>)}
                    </select>
                    <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="rounded-2xl border border-white/80 bg-white/90 px-5 py-3 text-base font-bold shadow-sm outline-none">
                      {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => <option key={m} value={m}>{m}月</option>)}
                    </select>
                  </div>
                </div>

                <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <SummaryCard tone="blue" label="課程回報" value={data.summary.reports} icon="▣" />
                  <SummaryCard tone="green" label="本月堂數" value={data.summary.lessons} icon="□" />
                  <SummaryCard tone="pink" label="本月總人數" value={data.summary.totalPeople} icon="◎" />
                  <SummaryCard tone="purple" label="學期證書" value={data.summary.assessments} icon="◇" />
                </div>
              </section>

              <div className="sticky top-0 z-10 mt-2 flex gap-3 overflow-x-auto border-y border-white/70 bg-[#EAF7FF]/80 px-1 py-5 backdrop-blur">
                <TabButton active={tab === "reports"} onClick={() => setTab("reports")} icon="★">課程回報</TabButton>
                <TabButton active={tab === "monthly"} onClick={() => setTab("monthly")} icon="▣">月報表</TabButton>
                <TabButton active={tab === "certificates"} onClick={() => setTab("certificates")} icon="◇">學期證書</TabButton>
              </div>

              {tab === "reports" && (
                <section className="space-y-5">
                  {data.reports.map((row) => (
                    <article key={row.id} className="relative overflow-hidden rounded-[28px] border border-white/80 bg-white/92 p-6 shadow-[0_20px_50px_rgba(64,87,128,0.12)]">
                      <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-[#FFF0BE]" />
                      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                        <div className="flex items-start gap-4">
                          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#FFE2EC] text-2xl text-[#E76C98]">▤</div>
                          <div>
                            <div className="text-2xl font-black text-[#142452]">{row.date}｜{row.courseName}</div>
                            <div className="mt-2 text-sm font-bold text-[#7683A0]">{row.time || "時間未填"}｜{row.teacherName}｜出席 {row.studentCount || "—"} 人</div>
                          </div>
                        </div>
                        <span className="w-fit rounded-2xl bg-emerald-50 px-4 py-2 text-sm font-black text-emerald-700 ring-1 ring-emerald-100">{row.schoolNotifyStatus || "已送出"}</span>
                      </div>
                      {(row.reportContent || row.aiSummary || row.aiTeachingNote) && (
                        <div className="mt-6 rounded-[22px] border border-[#BFD9FF] bg-[#F8FCFF] p-5 text-[15px] leading-8 text-[#142452]">
                          {row.reportContent && <p className="font-black">課程進度：{row.reportContent}</p>}
                          {row.aiSummary && <p className="mt-2">{row.aiSummary}</p>}
                          {row.aiTeachingNote && <p className="mt-2">{row.aiTeachingNote}</p>}
                        </div>
                      )}
                      <div className="mt-4 grid gap-3 md:grid-cols-3">
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
                <section className="overflow-hidden rounded-[28px] border border-white/80 bg-white/92 shadow-[0_20px_50px_rgba(64,87,128,0.12)]">
                  <div className="border-b border-[#EDF2FA] p-5 text-xl font-black text-[#142452]">本月課程明細</div>
                  <div className="divide-y divide-[#EDF2FA]">
                    {data.monthlyRows.map((row) => (
                      <div key={row.id} className="grid gap-2 p-5 text-sm md:grid-cols-[130px_1fr_120px_100px] md:items-center">
                        <div className="font-black text-[#142452]">{row.date}</div>
                        <div>
                          <div className="font-black text-slate-900">{row.courseName}</div>
                          <div className="mt-1 text-[#7683A0]">{row.teacherName}｜{row.time || "時間未填"}</div>
                        </div>
                        <div className="font-black text-blue-700">{row.studentCount} 人</div>
                        <div className="font-semibold text-slate-400">{row.reportContent ? "已回報" : "未回報"}</div>
                      </div>
                    ))}
                    {data.monthlyRows.length === 0 && <Empty text="這個月份尚無上課紀錄。" />}
                  </div>
                </section>
              )}

              {tab === "certificates" && (
                <section className="grid gap-5 md:grid-cols-2">
                  {data.assessments.map((row) => (
                    <article key={row.id} className="rounded-[28px] border border-white/80 bg-white/92 p-6 shadow-[0_20px_50px_rgba(64,87,128,0.12)]">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-xl font-black text-[#142452]">{row.childName}</div>
                          <div className="mt-1 text-sm font-semibold text-[#7683A0]">{row.date}｜{row.courseName}｜{row.teacherName}</div>
                        </div>
                        <span className="rounded-full bg-[#F3E7D0] px-3 py-1 text-xs font-black text-[#6E4C1E]">{row.title || "成長證書"}</span>
                      </div>
                      <p className="mt-4 line-clamp-3 text-sm leading-7 text-slate-600">{row.comment}</p>
                      <a href={row.certificateUrl} className="mt-5 inline-flex rounded-2xl bg-blue-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-blue-200">
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
    </div>
  );
}

function SummaryCard({ label, value, icon, tone }: { label: string; value: number; icon: string; tone: "blue" | "green" | "pink" | "purple" }) {
  const colors = {
    blue: "bg-blue-100 text-blue-600",
    green: "bg-green-100 text-green-600",
    pink: "bg-pink-100 text-pink-600",
    purple: "bg-violet-100 text-violet-600",
  };
  return (
    <div className="relative overflow-hidden rounded-[24px] bg-white/92 p-6 shadow-[0_18px_40px_rgba(64,87,128,0.12)] ring-1 ring-white/70">
      <div className={`flex h-16 w-16 items-center justify-center rounded-full text-2xl font-black ${colors[tone]}`}>{icon}</div>
      <div className="absolute right-7 top-8 text-base font-black text-[#142452]">{label}</div>
      <div className={`mt-4 text-4xl font-black ${colors[tone].split(" ").at(-1)}`}>{value.toLocaleString("zh-TW")}</div>
    </div>
  );
}

function TabButton({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: string; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`shrink-0 rounded-full px-6 py-3 text-sm font-black shadow-sm transition ${active ? "bg-blue-600 text-white shadow-blue-200" : "bg-white text-[#142452] border border-white/80"}`}>
      <span className="mr-2">{icon}</span>{children}
    </button>
  );
}

function MiniTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`shrink-0 rounded-full px-3 py-2 text-xs font-bold ${active ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600"}`}>
      {children}
    </button>
  );
}

function SideItem({ active, label, icon, onClick }: { active: boolean; label: string; icon: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-black transition ${active ? "bg-blue-500 text-white shadow-lg shadow-blue-200" : "text-[#5C4A3E] hover:bg-blue-50"}`}>
      <span className={`flex h-8 w-8 items-center justify-center rounded-xl ${active ? "bg-white/20" : "bg-[#FFF0BE] text-[#B67810]"}`}>{icon}</span>
      {label}
    </button>
  );
}

function InfoBlock({ title, text, warning }: { title: string; text: string; warning?: boolean }) {
  return (
    <div className={`rounded-2xl p-4 text-sm ${warning ? "bg-amber-50 text-amber-800" : "bg-blue-50 text-blue-800"}`}>
      <div className="font-black">{title}</div>
      <div className="mt-1 leading-6">{text}</div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="rounded-[28px] border border-dashed border-blue-100 bg-white/90 p-10 text-center text-slate-400">{text}</div>;
}
