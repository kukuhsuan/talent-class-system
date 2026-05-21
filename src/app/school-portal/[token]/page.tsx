"use client";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

type Tab = "home" | "outcomes" | "progress" | "monthly" | "certificates" | "notifications";

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

const NAV: Array<{ id: Tab; label: string; icon: string }> = [
  { id: "home", label: "首頁", icon: "⌂" },
  { id: "outcomes", label: "成果", icon: "★" },
  { id: "progress", label: "進度", icon: "⌁" },
  { id: "monthly", label: "月報", icon: "▦" },
  { id: "certificates", label: "證書", icon: "◇" },
  { id: "notifications", label: "通知", icon: "!" },
];

export default function SchoolPortalPage() {
  const params = useParams<{ token: string }>();
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [data, setData] = useState<PortalData | null>(null);
  const [tab, setTab] = useState<Tab>("home");
  const [menuOpen, setMenuOpen] = useState(false);
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

  const recentReports = useMemo(() => (data?.reports ?? []).slice(0, 3), [data]);
  const progressRows = useMemo(() => buildProgressRows(data?.reports ?? []), [data]);
  const latestNotice = data?.reports?.[0]?.schoolNotifyStatus ? `${data.reports[0].date} 最新課程回報已更新` : "本月尚無新的通知";

  if (error) {
    return <div className="min-h-screen bg-[#F2F8FF] px-5 py-16 text-center text-rose-500">{error}</div>;
  }

  return (
    <div className="min-h-screen bg-[#F2F8FF] text-[#142452]">
      <div className="fixed inset-0 pointer-events-none bg-[radial-gradient(circle_at_82%_8%,rgba(255,222,118,0.42),transparent_22%),radial-gradient(circle_at_8%_18%,rgba(255,255,255,0.9),transparent_20%),linear-gradient(180deg,#FFF6D8_0%,#FFFBEF_28%,#E9F7FF_28%,#F7FBFF_100%)]" />

      <div className="relative mx-auto flex min-h-screen max-w-[1440px] gap-7 px-3 pb-24 pt-3 sm:px-5 lg:px-7 lg:pb-8">
        <aside className="hidden w-[218px] shrink-0 rounded-[30px] bg-white/90 p-4 shadow-[0_20px_60px_rgba(87,107,145,0.15)] ring-1 ring-white/80 lg:sticky lg:top-5 lg:block lg:h-[calc(100vh-40px)]">
          <BrandBlock />
          <nav className="mt-6 space-y-2">
            {NAV.map((item) => (
              <NavButton key={item.id} active={tab === item.id} icon={item.icon} label={item.label === "首頁" ? "首頁總覽" : item.label} onClick={() => setTab(item.id)} />
            ))}
          </nav>
          <div className="mt-6 rounded-[28px] bg-gradient-to-b from-[#FFF4CF] to-[#E8F7D9] p-4 text-center">
            <div className="mx-auto h-14 w-14 rounded-full bg-[#FFD66E]" />
            <p className="mt-3 text-sm font-black text-[#8A6A2E]">成果展示平台</p>
            <p className="mt-1 text-xs leading-5 text-[#A08348]">給園所主任快速查看課程成果</p>
          </div>
        </aside>

        {menuOpen && (
          <div className="fixed inset-0 z-40 bg-slate-900/30 lg:hidden" onClick={() => setMenuOpen(false)}>
            <div className="h-full w-[82vw] max-w-sm rounded-r-[32px] bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <BrandBlock />
              <div className="mt-6 grid gap-2">
                {NAV.map((item) => (
                  <NavButton key={item.id} active={tab === item.id} icon={item.icon} label={item.label === "首頁" ? "首頁總覽" : item.label} onClick={() => { setTab(item.id); setMenuOpen(false); }} />
                ))}
              </div>
            </div>
          </div>
        )}

        <main className="min-w-0 flex-1">
          <div className="mb-4 flex items-center justify-between rounded-[24px] bg-white/88 px-4 py-3 shadow-sm ring-1 ring-white/80 lg:hidden">
            <button onClick={() => setMenuOpen(true)} className="rounded-2xl bg-blue-50 px-4 py-3 text-lg font-black text-blue-700">☰</button>
            <div className="text-center">
              <div className="text-sm font-black text-[#4A2C17]">才藝課管理系統</div>
              <div className="text-xs text-slate-500">園所成果展示</div>
            </div>
            <div className="h-12 w-12 rounded-2xl bg-[#FFE1A3]" />
          </div>

          {loading || !data ? (
            <div className="rounded-[30px] bg-white/90 p-12 text-center text-slate-400 shadow-sm">載入園所成果中...</div>
          ) : (
            <>
              <Hero data={data} year={year} month={month} setYear={setYear} setMonth={setMonth} />

              <section className="mt-5 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
                <SummaryCard tone="blue" label="本月堂數" value={data.summary.lessons} helper="已完成課程" icon="▣" />
                <SummaryCard tone="green" label="本月總人數" value={data.summary.totalPeople} helper="累積參與" icon="◎" />
                <SummaryCard tone="pink" label="最近課程" value={data.summary.reports} helper="成果回報" icon="★" />
                <SummaryCard tone="purple" label="學期成果" value={data.summary.assessments} helper="證書紀錄" icon="◇" />
              </section>

              <div className="sticky top-0 z-20 mt-5 hidden gap-3 overflow-x-auto border-y border-white/70 bg-[#EAF7FF]/80 py-4 backdrop-blur lg:flex">
                {NAV.map((item) => (
                  <TabPill key={item.id} active={tab === item.id} onClick={() => setTab(item.id)} icon={item.icon}>{item.label}</TabPill>
                ))}
              </div>

              <section className="mt-5">
                {tab === "home" && (
                  <div className="space-y-5">
                    <PanelTitle title="最近成果回報" subtitle="園所端只呈現課程成果，不顯示內部行政資料。" />
                    <OutcomeList rows={recentReports} />
                    <PanelTitle title="本學期進度" subtitle="依回報內容整理目前課程推進狀況。" />
                    <ProgressTimeline rows={progressRows.slice(0, 4)} />
                    <PanelTitle title="最新通知" subtitle={latestNotice} />
                    <NotificationList rows={data.reports.slice(0, 5)} />
                  </div>
                )}

                {tab === "outcomes" && (
                  <div className="space-y-5">
                    <PanelTitle title="學習成果牆" subtitle="每堂課一張成果卡，方便主任快速閱讀。" />
                    <OutcomeList rows={data.reports} />
                  </div>
                )}

                {tab === "progress" && (
                  <div className="space-y-5">
                    <PanelTitle title="課程進度" subtitle="顯示目前上到第幾堂與課程主題。" />
                    <ProgressTimeline rows={progressRows} />
                  </div>
                )}

                {tab === "monthly" && (
                  <div className="space-y-5">
                    <PanelTitle title="月報表" subtitle="本月課程、人數與回報狀態。" />
                    <MonthlyCards rows={data.monthlyRows} />
                  </div>
                )}

                {tab === "certificates" && (
                  <div className="space-y-5">
                    <PanelTitle title="孩子學習成果 / 證書" subtitle="學期證書、成長徽章與成果總結。" />
                    <CertificateCards rows={data.assessments} />
                  </div>
                )}

                {tab === "notifications" && (
                  <div className="space-y-5">
                    <PanelTitle title="通知中心" subtitle="只顯示與園所相關的成果通知狀態。" />
                    <NotificationList rows={data.reports} />
                  </div>
                )}
              </section>
            </>
          )}
        </main>
      </div>

      <nav className="fixed inset-x-3 bottom-3 z-30 grid grid-cols-5 gap-2 rounded-[26px] bg-white/95 p-2 shadow-[0_18px_50px_rgba(65,85,120,0.22)] ring-1 ring-white/90 lg:hidden">
        {NAV.filter((item) => item.id !== "notifications").map((item) => (
          <button key={item.id} onClick={() => setTab(item.id)} className={`rounded-2xl px-2 py-2 text-center text-[11px] font-black ${tab === item.id ? "bg-blue-600 text-white" : "text-slate-500"}`}>
            <div className="text-base">{item.icon}</div>
            {item.label}
          </button>
        ))}
      </nav>
    </div>
  );
}

function Hero({ data, year, month, setYear, setMonth }: { data: PortalData; year: number; month: number; setYear: (v: number) => void; setMonth: (v: number) => void }) {
  return (
    <section className="relative overflow-hidden rounded-[34px] px-4 py-7 sm:px-7 lg:px-8">
      <div className="absolute right-8 top-6 hidden h-16 w-16 rounded-full bg-[#FFD569] shadow-[0_0_0_18px_rgba(255,213,105,0.25)] md:block" />
      <div className="absolute right-48 top-12 hidden h-8 w-20 rounded-full bg-white/80 md:block" />
      <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-[#142452] sm:text-4xl">您好！</h1>
          <p className="mt-3 text-base font-medium leading-7 text-[#5C4A3E]">本月學習成果總覽，讓主任快速看見孩子的課程成果。</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="rounded-full bg-white/85 px-4 py-2 text-sm font-black text-blue-700 shadow-sm">{data.school.name}</span>
            <span className="rounded-full bg-white/85 px-4 py-2 text-sm font-black text-emerald-700 shadow-sm">{data.school.type}</span>
            {data.school.region && <span className="rounded-full bg-white/85 px-4 py-2 text-sm font-black text-amber-700 shadow-sm">{data.school.region}</span>}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="min-h-12 rounded-2xl border border-white/80 bg-white/95 px-4 py-3 text-base font-black shadow-sm outline-none">
            {[2025, 2026, 2027].map((y) => <option key={y}>{y}年</option>)}
          </select>
          <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="min-h-12 rounded-2xl border border-white/80 bg-white/95 px-4 py-3 text-base font-black shadow-sm outline-none">
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => <option key={m} value={m}>{m}月</option>)}
          </select>
        </div>
      </div>
    </section>
  );
}

function buildProgressRows(rows: PortalData["reports"]) {
  return rows
    .filter((row) => row.reportContent || row.aiSummary)
    .map((row) => {
      const match = row.reportContent.match(/第\s*\d+\s*堂[^，。]*/);
      return {
        id: row.id,
        date: row.date,
        courseName: row.courseName,
        title: match?.[0] || row.reportContent.split(/[，。\n]/)[0] || "課程進度已更新",
        summary: row.aiSummary || row.reportContent,
        studentCount: row.studentCount,
      };
    });
}

function OutcomeList({ rows }: { rows: PortalData["reports"] }) {
  if (rows.length === 0) return <Empty text="這個月份尚無課程成果回報。" />;
  return (
    <div className="space-y-4">
      {rows.map((row) => (
        <article key={row.id} className="relative overflow-hidden rounded-[28px] border border-white/80 bg-white/94 p-5 shadow-[0_20px_50px_rgba(64,87,128,0.12)] sm:p-6">
          <div className="absolute -right-8 -top-8 h-28 w-28 rounded-full bg-[#FFF0BE]" />
          <div className="relative flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#FFE2EC] text-2xl text-[#E76C98]">▤</div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="text-xl font-black text-[#142452] sm:text-2xl">{row.courseName}</h3>
                  <p className="mt-1 text-sm font-bold text-[#7683A0]">{row.date}｜{row.teacherName}｜出席 {row.studentCount || "—"} 人</p>
                </div>
                <span className="w-fit rounded-2xl bg-emerald-50 px-4 py-2 text-sm font-black text-emerald-700 ring-1 ring-emerald-100">已完成回報</span>
              </div>
              <div className="mt-5 rounded-[22px] border border-[#BFD9FF] bg-[#F8FCFF] p-4 text-[15px] leading-8 text-[#142452]">
                {row.reportContent && <p className="font-black">課程進度：{row.reportContent}</p>}
                {row.aiSummary && <p className="mt-2">{row.aiSummary}</p>}
                {row.aiTeachingNote && <p className="mt-2">{row.aiTeachingNote}</p>}
                {!row.aiSummary && !row.aiTeachingNote && !row.reportContent && <p>本堂課已完成回報。</p>}
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {row.skillFocus && <InfoBlock title="能力培養" text={row.skillFocus} />}
                {row.classStatus && <InfoBlock title="課堂狀況" text={row.classStatus} />}
                {row.incident && <InfoBlock title="特殊事件" text={`${row.incidentChild || "未填孩子"}｜${row.incidentProcess || "未填經過"}｜${row.incidentAction || "未填處理方式"}`} warning />}
              </div>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

function ProgressTimeline({ rows }: { rows: ReturnType<typeof buildProgressRows> }) {
  if (rows.length === 0) return <Empty text="尚無課程進度資料。" />;
  return (
    <div className="space-y-3">
      {rows.map((row, index) => (
        <article key={row.id} className="flex gap-4 rounded-[24px] bg-white/94 p-5 shadow-sm ring-1 ring-white/80">
          <div className="flex flex-col items-center">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-blue-600 text-sm font-black text-white">{index + 1}</div>
            {index < rows.length - 1 && <div className="mt-2 h-full min-h-10 w-1 rounded-full bg-blue-100" />}
          </div>
          <div>
            <div className="text-sm font-bold text-[#7683A0]">{row.date}｜{row.courseName}｜出席 {row.studentCount || "—"} 人</div>
            <h3 className="mt-1 text-lg font-black text-[#142452]">{row.title}</h3>
            <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-600">{row.summary}</p>
          </div>
        </article>
      ))}
    </div>
  );
}

function MonthlyCards({ rows }: { rows: PortalData["monthlyRows"] }) {
  if (rows.length === 0) return <Empty text="這個月份尚無上課紀錄。" />;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {rows.map((row) => (
        <article key={row.id} className="rounded-[24px] bg-white/94 p-5 shadow-sm ring-1 ring-white/80">
          <div className="text-sm font-bold text-[#7683A0]">{row.date}｜{row.time || "時間未填"}</div>
          <h3 className="mt-2 text-xl font-black text-[#142452]">{row.courseName}</h3>
          <p className="mt-1 text-sm font-semibold text-slate-500">{row.teacherName}</p>
          <div className="mt-4 flex items-center justify-between">
            <span className="rounded-2xl bg-blue-50 px-4 py-2 text-sm font-black text-blue-700">出席 {row.studentCount} 人</span>
            <span className="text-sm font-bold text-slate-400">{row.reportContent ? "已回報" : "未回報"}</span>
          </div>
        </article>
      ))}
    </div>
  );
}

function CertificateCards({ rows }: { rows: PortalData["assessments"] }) {
  if (rows.length === 0) return <Empty text="這個月份尚無學期證書。" />;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {rows.map((row) => (
        <article key={row.id} className="rounded-[28px] border border-white/80 bg-white/94 p-5 shadow-[0_20px_50px_rgba(64,87,128,0.12)]">
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
    </div>
  );
}

function NotificationList({ rows }: { rows: PortalData["reports"] }) {
  const notices = rows.filter((row) => row.schoolNotifyStatus).slice(0, 8);
  if (notices.length === 0) return <Empty text="目前沒有新的通知。" />;
  return (
    <div className="space-y-3">
      {notices.map((row) => (
        <div key={row.id} className="rounded-[22px] bg-white/94 p-4 shadow-sm ring-1 ring-white/80">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="font-black text-[#142452]">{row.courseName} 成果回報</div>
              <div className="mt-1 text-sm font-semibold text-[#7683A0]">{row.date}｜{row.teacherName}</div>
            </div>
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">{row.schoolNotifyStatus}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function SummaryCard({ label, value, helper, icon, tone }: { label: string; value: number; helper: string; icon: string; tone: "blue" | "green" | "pink" | "purple" }) {
  const colors = {
    blue: "bg-blue-100 text-blue-600",
    green: "bg-green-100 text-green-600",
    pink: "bg-pink-100 text-pink-600",
    purple: "bg-violet-100 text-violet-600",
  };
  return (
    <div className="relative overflow-hidden rounded-[24px] bg-white/94 p-4 shadow-[0_18px_40px_rgba(64,87,128,0.12)] ring-1 ring-white/80 sm:p-5">
      <div className={`flex h-12 w-12 items-center justify-center rounded-full text-xl font-black sm:h-14 sm:w-14 ${colors[tone]}`}>{icon}</div>
      <div className="mt-4 text-sm font-black text-[#142452]">{label}</div>
      <div className={`mt-1 text-4xl font-black ${colors[tone].split(" ").at(-1)}`}>{value.toLocaleString("zh-TW")}</div>
      <div className="mt-1 text-xs font-semibold text-slate-400">{helper}</div>
    </div>
  );
}

function PanelTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <h2 className="text-2xl font-black text-[#142452]">{title}</h2>
      <p className="mt-1 text-sm font-medium text-[#7683A0]">{subtitle}</p>
    </div>
  );
}

function TabPill({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: string; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`shrink-0 rounded-full px-6 py-3 text-sm font-black shadow-sm transition ${active ? "bg-blue-600 text-white shadow-blue-200" : "bg-white text-[#142452] border border-white/80"}`}>
      <span className="mr-2">{icon}</span>{children}
    </button>
  );
}

function BrandBlock() {
  return (
    <div className="flex flex-col items-center border-b border-[#F2E6CA] pb-5 pt-3">
      <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-[#FFE1A3] text-3xl shadow-inner">✦</div>
      <div className="mt-3 text-center text-lg font-black text-[#4A2C17]">才藝課管理系統</div>
      <div className="mt-1 text-xs font-bold text-[#A08348]">園所成果展示</div>
    </div>
  );
}

function NavButton({ active, label, icon, onClick }: { active: boolean; label: string; icon: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`flex min-h-12 w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-black transition ${active ? "bg-blue-500 text-white shadow-lg shadow-blue-200" : "text-[#5C4A3E] hover:bg-blue-50"}`}>
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
