"use client";
import { useEffect, useMemo, useState } from "react";
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

type Tab = "home" | "outcomes" | "progress" | "certificates";

const NAV: Array<{ id: Tab; label: string; icon: string }> = [
  { id: "home", label: "首頁", icon: "⌂" },
  { id: "outcomes", label: "成果", icon: "★" },
  { id: "progress", label: "進度", icon: "⌁" },
  { id: "certificates", label: "證書", icon: "◇" },
];

const SKILL_MAP: Record<string, { icon: string; description: string; image?: string }> = {
  專注力: { icon: "◎", image: "/skill-cards/focus.png", description: "提升專注判斷" },
  團隊合作: { icon: "◇", image: "/skill-cards/teamwork.png", description: "練習合作互動" },
  團隊互動: { icon: "◇", image: "/skill-cards/teamwork.png", description: "培養互動默契" },
  肢體協調: { icon: "⌁", description: "提升動作流暢" },
  規則理解: { icon: "□", description: "理解課堂規則" },
  情緒控制: { icon: "○", description: "練習穩定參與" },
  手眼協調: { icon: "◉", description: "提升反應配合" },
  反應力: { icon: "↯", image: "/skill-cards/reaction.png", description: "提升敏銳反應" },
  敏捷速度: { icon: "↗", description: "練習快速移動" },
  自信心建立: { icon: "♡", image: "/skill-cards/confidence.png", description: "建立自信表現" },
  自信表現: { icon: "♡", image: "/skill-cards/confidence.png", description: "建立自信表現" },
};

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

  if (error) {
    return <div className="min-h-screen bg-[#F2F8FF] px-5 py-16 text-center text-rose-500">{error}</div>;
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] text-[#142452]">
      <div className="fixed inset-0 pointer-events-none bg-[radial-gradient(circle_at_82%_6%,rgba(96,165,250,0.16),transparent_24%),linear-gradient(180deg,#f8fafc_0%,#eef4ff_42%,#f8fafc_100%)]" />

      <div className="relative mx-auto flex min-h-screen max-w-[1440px] gap-7 px-3 pb-24 pt-3 sm:px-5 lg:px-7 lg:pb-8">
        <aside className="hidden w-[218px] shrink-0 rounded-[26px] bg-white p-4 shadow-[0_16px_42px_rgba(30,64,175,0.08)] ring-1 ring-slate-200/80 lg:sticky lg:top-5 lg:block lg:h-[calc(100vh-40px)]">
          <BrandBlock />
          <nav className="mt-6 space-y-2">
            {NAV.map((item) => (
              <NavButton key={item.id} active={tab === item.id} icon={item.icon} label={item.label === "首頁" ? "首頁總覽" : item.label} onClick={() => setTab(item.id)} />
            ))}
          </nav>
          <div className="mt-6 rounded-[24px] bg-[#f5f7fb] p-4 text-center ring-1 ring-slate-200/70">
            <div className="mx-auto h-10 w-10 rounded-2xl bg-blue-100" />
            <p className="mt-3 text-sm font-black text-slate-800">成果展示平台</p>
            <p className="mt-1 text-xs leading-5 text-slate-500">快速查看課程成果與學期證書</p>
          </div>
        </aside>

        {menuOpen && (
          <div className="fixed inset-0 z-40 bg-slate-900/30 lg:hidden" onClick={() => setMenuOpen(false)}>
            <div className="h-full w-[82vw] max-w-sm rounded-r-[28px] bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
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
          <div className="mb-4 flex items-center justify-between rounded-[22px] bg-white px-4 py-3 shadow-sm ring-1 ring-slate-200/80 lg:hidden">
            <button onClick={() => setMenuOpen(true)} className="rounded-2xl bg-blue-50 px-4 py-3 text-lg font-black text-blue-700">☰</button>
            <div className="text-center">
              <div className="text-sm font-black text-slate-900">才藝課管理系統</div>
              <div className="text-xs text-slate-500">園所成果展示</div>
            </div>
            <div className="h-12 w-12 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
              <img src="/upbear-logo.png" alt="優比熊" className="h-full w-full object-cover" />
            </div>
          </div>

          {loading || !data ? (
            <div className="rounded-[30px] bg-white/90 p-12 text-center text-slate-400 shadow-sm">載入園所成果中...</div>
          ) : (
            <>
              <Hero data={data} year={year} month={month} setYear={setYear} setMonth={setMonth} />

              <section className="mt-5 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
                <SummaryCard label="本月堂數" value={data.summary.lessons} helper="已完成課程" icon="▣" />
                <SummaryCard label="本月總人數" value={data.summary.totalPeople} helper="累積參與" icon="◎" />
                <SummaryCard label="成果回報" value={data.summary.reports} helper="本月紀錄" icon="★" />
                <SummaryCard label="學期成果" value={data.summary.assessments} helper="證書紀錄" icon="◇" />
              </section>

              <div className="sticky top-0 z-20 mt-5 hidden gap-3 overflow-x-auto border-y border-slate-200/80 bg-[#f8fafc]/90 py-4 backdrop-blur lg:flex">
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

                {tab === "certificates" && (
                  <div className="space-y-5">
                    <PanelTitle title="孩子學習成果 / 證書" subtitle="學期證書、成長徽章與成果總結。" />
                    <CertificateCards rows={data.assessments} />
                  </div>
                )}

              </section>
            </>
          )}
        </main>
      </div>

      <nav className="fixed inset-x-3 bottom-3 z-30 grid grid-cols-4 gap-2 rounded-[24px] bg-white/95 p-2 shadow-[0_14px_42px_rgba(30,64,175,0.16)] ring-1 ring-slate-200/80 lg:hidden">
        {NAV.map((item) => (
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
    <section className="relative overflow-hidden rounded-[28px] border border-slate-200/80 bg-white px-4 py-7 shadow-[0_16px_42px_rgba(30,64,175,0.07)] sm:px-7 lg:px-8">
      <div className="absolute right-8 top-8 hidden h-16 w-16 rounded-full bg-blue-50 md:block" />
      <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-[#142452] sm:text-4xl">您好！</h1>
          <p className="mt-3 text-base font-medium leading-7 text-slate-600">本月學習成果總覽，讓主任快速看見孩子的課程成果。</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="rounded-full bg-blue-50 px-4 py-2 text-sm font-black text-blue-700">{data.school.name}</span>
            <span className="rounded-full bg-slate-100 px-4 py-2 text-sm font-black text-slate-600">{data.school.type}</span>
            {data.school.region && <span className="rounded-full bg-slate-100 px-4 py-2 text-sm font-black text-slate-600">{data.school.region}</span>}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="min-h-12 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base font-black text-slate-700 shadow-sm outline-none">
            {[2025, 2026, 2027].map((y) => <option key={y}>{y}年</option>)}
          </select>
          <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="min-h-12 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base font-black text-slate-700 shadow-sm outline-none">
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
        <OutcomeCard key={row.id} row={row} />
      ))}
    </div>
  );
}

function OutcomeCard({ row }: { row: PortalData["reports"][number] }) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const skills = parseSkillFocus(row.skillFocus || row.aiSkillFocus);
  const progressText = cleanProgressText(row.reportContent);
  const outcomeText = buildParentFriendlyText(row.aiTeachingNote, row.aiSummary, skills);
  const mainText = [progressText ? `課程進度\n${formatProgressLine(progressText, row.courseName)}` : "", outcomeText].filter(Boolean).join("\n\n") || "孩子們順利完成今天的課程活動 ✨";
  const canExpand = mainText.length > 95;

  async function copyShareText() {
    const text = [
      `${row.date}｜${row.courseName}`,
      `今日成果：${outcomeText || progressText || "本堂課已完成課程回報。"}`,
      skills.length ? `能力培養：${skills.join("、")}` : "",
      `出席人數：${row.studentCount || "—"} 人`,
    ].filter(Boolean).join("\n");

    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
      window.prompt("可複製以下內容分享給家長", text);
    }
  }

  return (
    <article className="relative overflow-hidden rounded-[24px] border border-slate-200/80 bg-white p-5 shadow-[0_14px_34px_rgba(30,64,175,0.07)] sm:p-6">
      <div className="absolute -right-8 -top-8 h-28 w-28 rounded-full bg-blue-50" />
      <div className="relative flex items-start gap-4">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-2xl text-blue-600">▤</div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h3 className="text-xl font-black text-[#142452] sm:text-2xl">{row.courseName}</h3>
              <p className="mt-1 text-sm font-bold text-[#7683A0]">{row.date}｜{row.teacherName}｜出席 {row.studentCount || "—"} 人</p>
            </div>
            <span className="w-fit rounded-2xl bg-blue-50 px-4 py-2 text-sm font-black text-blue-700 ring-1 ring-blue-100">已完成回報</span>
          </div>

          <div className="mt-5 rounded-[20px] border border-blue-100 bg-[#f8fafc] p-4 text-[15px] leading-8 text-[#142452]">
            <p className={`whitespace-pre-line ${expanded ? "" : "line-clamp-3"}`}>{mainText}</p>
            {canExpand && (
              <button type="button" onClick={() => setExpanded((v) => !v)} className="mt-2 text-sm font-black text-blue-600">
                {expanded ? "收合內容" : "查看更多"}
              </button>
            )}
          </div>

          <SkillCards skills={skills} />

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {row.classStatus && <StatusBlock title="課堂狀況" text={row.classStatus} />}
            {row.incident && <StatusBlock title="特殊事件" text={`${row.incidentChild || "未填孩子"}｜${row.incidentProcess || "未填經過"}｜${row.incidentAction || "未填處理方式"}`} warning />}
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <button type="button" onClick={copyShareText} className="rounded-2xl bg-blue-600 px-5 py-3 text-sm font-black text-white shadow-sm transition hover:bg-blue-700">
              {copied ? "已複製" : "複製分享內容"}
            </button>
            <button type="button" disabled className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-400">
              分享圖片（即將推出）
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

function parseSkillFocus(value: string) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.map(String).map((item) => item.trim()).filter(Boolean);
  } catch {
    // Existing records may be plain text; split them below.
  }
  return value.split(/[、,，\n]/).map((item) => item.trim()).filter(Boolean);
}

function cleanProgressText(value: string) {
  return (value || "")
    .replace(/^(課程進度[:：]\s*)+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function formatProgressLine(value: string, courseName: string) {
  const text = cleanProgressText(value).replace(/^第\s*(\d+)\s*堂\s*/, "第 $1 堂｜");
  const emoji = courseName.includes("足球") ? " ⚽" : courseName.includes("高爾夫") ? " ⛳" : courseName.includes("棒球") ? " ⚾" : "";
  return `${text}${emoji}`;
}

function normalizeReportText(value: string, skills: string[]) {
  const text = (value || "")
    .replace(/\s+/g, " ")
    .replace(/今日課程主要進行/g, "孩子們練習")
    .replace(/本次課程主要進行/g, "孩子們練習")
    .replace(/本堂課主要進行/g, "孩子們練習")
    .replace(/本次課程/g, "")
    .replace(/本堂課/g, "")
    .replace(/今日課程/g, "")
    .replace(/整體課堂進行順利/g, "課堂進行順利")
    .replace(/(本堂課孩子整體參與狀況良好，能在老師引導下完成指定任務。)\s*\1/g, "$1")
    .trim();
  return text
    .split(/[。！？]/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .filter((sentence, index, list) => list.findIndex((item) => item === sentence) === index)
    .filter((sentence) => !sentence.includes("能力培養") && !sentence.includes("培養孩子的") && !skills.some((skill) => sentence.includes(`、${skill}`)))
    .slice(0, 2)
    .map((sentence) => `${sentence}。`)
    .join("\n");
}

function buildParentFriendlyText(teachingNote: string, summary: string, skills: string[]) {
  const primary = normalizeReportText(teachingNote, skills);
  const secondary = normalizeReportText(summary, skills);
  if (primary && secondary && primary.includes(secondary)) return primary;
  const text = primary || secondary;
  if (text) return text;
  return "孩子們能跟著老師完成指定任務，課堂氣氛活潑順利 ✨";
}

function SkillCards({ skills }: { skills: string[] }) {
  if (skills.length === 0) return null;
  return (
    <section className="mt-5 rounded-[24px] border border-slate-200/80 bg-white p-4 sm:p-5">
      <div className="text-base font-black tracking-wide text-[#142452]">孩子在課程中可以學習到</div>
      <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-3">
        {skills.map((skill) => {
          const meta = SKILL_MAP[skill];
          return (
            <div key={skill} className="flex min-h-[190px] flex-col items-center justify-start rounded-[24px] bg-[#f8fafc] p-4 text-center ring-1 ring-slate-200/80 shadow-[0_10px_24px_rgba(30,64,175,0.05)] sm:min-h-[210px] sm:p-5">
              {meta?.image ? (
                <img src={meta.image} alt={skill} loading="lazy" className="aspect-square w-full max-w-[118px] rounded-[24px] object-contain sm:max-w-[150px]" />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-blue-50 text-3xl font-black text-blue-600 shadow-inner">{meta?.icon ?? "•"}</div>
              )}
              <div className="mt-3 text-lg font-black leading-tight text-[#142452]">{skill}</div>
              <p className="mt-2 text-sm font-bold leading-5 text-slate-500">{meta?.description ?? "安排能力練習"}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ProgressTimeline({ rows }: { rows: ReturnType<typeof buildProgressRows> }) {
  if (rows.length === 0) return <Empty text="尚無課程進度資料。" />;
  return (
    <div className="space-y-3">
      {rows.map((row, index) => (
        <article key={row.id} className="flex gap-4 rounded-[22px] bg-white p-5 shadow-sm ring-1 ring-slate-200/80">
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

function CertificateCards({ rows }: { rows: PortalData["assessments"] }) {
  if (rows.length === 0) return <Empty text="這個月份尚無學期證書。" />;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {rows.map((row) => (
        <article key={row.id} className="rounded-[24px] border border-slate-200/80 bg-white p-5 shadow-[0_14px_34px_rgba(30,64,175,0.07)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xl font-black text-[#142452]">{row.childName}</div>
              <div className="mt-1 text-sm font-semibold text-[#7683A0]">{row.date}｜{row.courseName}｜{row.teacherName}</div>
            </div>
            <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">{row.title || "成長證書"}</span>
          </div>
          <p className="mt-4 line-clamp-3 text-sm leading-7 text-slate-600">{row.comment}</p>
          <a href={row.certificateUrl} className="mt-5 inline-flex rounded-2xl bg-blue-600 px-5 py-3 text-sm font-black text-white shadow-sm">
            查看證書
          </a>
        </article>
      ))}
    </div>
  );
}

function SummaryCard({ label, value, helper, icon }: { label: string; value: number; helper: string; icon: string }) {
  return (
    <div className="relative overflow-hidden rounded-[22px] bg-white p-4 shadow-[0_14px_34px_rgba(30,64,175,0.07)] ring-1 ring-slate-200/80 sm:p-5">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-xl font-black text-blue-600 sm:h-14 sm:w-14">{icon}</div>
      <div className="mt-4 text-sm font-black text-[#142452]">{label}</div>
      <div className="mt-1 text-4xl font-black text-blue-600">{value.toLocaleString("zh-TW")}</div>
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
    <button onClick={onClick} className={`shrink-0 rounded-full px-6 py-3 text-sm font-black shadow-sm transition ${active ? "bg-blue-600 text-white" : "bg-white text-[#142452] border border-slate-200"}`}>
      <span className="mr-2">{icon}</span>{children}
    </button>
  );
}

function BrandBlock() {
  return (
    <div className="flex flex-col items-center border-b border-slate-200 pb-5 pt-3">
      <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-[28px] bg-white shadow-sm ring-1 ring-slate-200">
        <img src="/upbear-logo.png" alt="優比熊" className="h-full w-full object-cover" />
      </div>
      <div className="mt-3 text-center text-lg font-black text-slate-900">才藝課管理系統</div>
      <div className="mt-1 text-xs font-bold text-slate-500">園所成果展示</div>
    </div>
  );
}

function NavButton({ active, label, icon, onClick }: { active: boolean; label: string; icon: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`flex min-h-12 w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-black transition ${active ? "bg-blue-600 text-white shadow-sm" : "text-slate-600 hover:bg-blue-50 hover:text-blue-700"}`}>
      <span className={`flex h-8 w-8 items-center justify-center rounded-xl ${active ? "bg-white/20" : "bg-slate-100 text-slate-500"}`}>{icon}</span>
      {label}
    </button>
  );
}

function StatusBlock({ title, text, warning }: { title: string; text: string; warning?: boolean }) {
  return (
    <div className={`rounded-2xl p-4 text-sm ${warning ? "bg-[#fff7ed] text-slate-700" : "bg-blue-50 text-blue-800"}`}>
      <div className="font-black">{title}</div>
      <div className="mt-1 leading-6">{text}</div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="rounded-[24px] border border-dashed border-slate-200 bg-white p-10 text-center text-slate-400">{text}</div>;
}
