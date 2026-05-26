"use client";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

type PortalData = {
  school: { name: string; type: string; region: string; address: string; contact: string; phone: string };
  year: number;
  month: number;
  summary: { reports: number; lessons: number; totalPeople: number; assessments: number };
  reports: Array<{
    id: number; date: string; courseType?: string; courseName: string; department: string; category: string; time: string; teacherName: string;
    studentCount: number; reportContent: string; skillFocus: string; classStatus: string; incident: boolean;
    incidentChild: string; incidentProcess: string; incidentAction: string; incidentNotified: string;
    aiSummary: string; aiSkillFocus: string; aiTeachingNote: string; representativePhotoUrl: string; schoolNotifyStatus: string;
  }>;
  monthlyRows: Array<{ id: number; date: string; courseName: string; teacherName: string; time: string; studentCount: number; reportContent: string }>;
  curriculum: Array<{ courseType: string; courseName: string; items: Array<{ lesson: number; title: string }> }>;
  assessments: Array<{ id: number; childName: string; courseName: string; teacherName: string; date: string; title: string; comment: string; certificateUrl: string }>;
  skillCards: Array<{ name: string; icon: string; imageUrl: string; description: string }>;
};

type Tab = "home" | "outcomes" | "progress" | "certificates";

const NAV: Array<{ id: Tab; label: string; icon: string }> = [
  { id: "home", label: "首頁", icon: "⌂" },
  { id: "outcomes", label: "成果", icon: "★" },
  { id: "progress", label: "進度", icon: "⌁" },
  { id: "certificates", label: "證書", icon: "◇" },
];

type SkillMeta = { icon: string; description: string; image?: string };

const SKILL_MAP: Record<string, SkillMeta> = {
  專注力: { icon: "◎", image: "/skill-cards/focus.png", description: "提升專注判斷" },
  團隊合作: { icon: "◇", image: "/skill-cards/teamwork.png", description: "練習合作互動" },
  團隊互動: { icon: "◇", image: "/skill-cards/teamwork.png", description: "培養互動默契" },
  肢體協調: { icon: "🏃", image: "/skill-cards/body-coordination.png", description: "提升動作流暢" },
  肌肉發展: { icon: "💪", image: "/skill-cards/muscle.png", description: "強化基礎肌力" },
  規則理解: { icon: "📘", image: "/skill-cards/rules.png", description: "理解課堂規則" },
  情緒控制: { icon: "😊", image: "/skill-cards/confidence.png", description: "練習穩定參與" },
  手眼協調: { icon: "👀", image: "/skill-cards/focus.png", description: "提升反應配合" },
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
  const learningMaps = useMemo(() => buildLearningMaps(data?.reports ?? [], data?.curriculum ?? []), [data]);
  const skillMap = useMemo(() => buildSkillMap(data?.skillCards ?? []), [data]);

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
            <p className="mt-3 text-sm font-black text-slate-800">AI 學習成果平台</p>
            <p className="mt-1 text-xs leading-5 text-slate-500">快速查看孩子成長、課程進度與學期證書</p>
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
              <div className="text-sm font-black text-slate-900">WaysLeader AI</div>
              <div className="text-xs text-slate-500">幼兒園學習成果平台</div>
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

              <section className="mt-5">
                <PanelTitle title="本學期進度" subtitle="目前學到哪、已完成多少堂，一眼就能看懂。" />
                <div className="mt-3">
                  <LearningMaps maps={learningMaps.slice(0, 2)} compact />
                </div>
              </section>

              <section className="mt-3 grid grid-cols-4 gap-2 sm:mt-5 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4">
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

              <section className="mt-4 sm:mt-5">
                {tab === "home" && (
                  <div className="space-y-3 sm:space-y-5">
                    <PanelTitle title="最近學習成果" subtitle="用成果卡看見孩子正在學什麼、練習什麼能力。" />
                    <OutcomeList rows={recentReports} skillMap={skillMap} />
                  </div>
                )}

                {tab === "outcomes" && (
                  <div className="space-y-3 sm:space-y-5">
                    <PanelTitle title="學習成果牆" subtitle="每堂課一張成果卡，讓園所快速看見孩子的課程亮點。" />
                    <OutcomeList rows={data.reports} skillMap={skillMap} />
                  </div>
                )}

                {tab === "progress" && (
                  <div className="space-y-5">
                    <PanelTitle title="學習進度地圖" subtitle="用時間軸看見目前學到哪、下一步會練習什麼。" />
                    <LearningMaps maps={learningMaps} />
                  </div>
                )}

                {tab === "certificates" && (
                  <div className="space-y-5">
                    <PanelTitle title="孩子學習成果 / 證書" subtitle="AI 發展報告、成長徽章與成果證書集中查看。" />
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
    <section className="relative overflow-hidden rounded-[22px] border border-slate-200/80 bg-white px-4 py-4 shadow-[0_12px_28px_rgba(30,64,175,0.06)] sm:rounded-[28px] sm:px-7 sm:py-7 lg:px-8">
      <div className="absolute right-8 top-8 hidden h-16 w-16 rounded-full bg-blue-50 md:block" />
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-xl font-black tracking-tight text-[#142452] sm:text-4xl">您好！</h1>
          <p className="mt-1 text-sm font-medium leading-6 text-slate-600 sm:mt-3 sm:text-base sm:leading-7">本月學習成果總覽，快速看見孩子的課程成果。</p>
          <div className="mt-2 flex flex-wrap gap-1.5 sm:mt-4 sm:gap-2">
            <span className="rounded-full bg-blue-50 px-3 py-1.5 text-xs font-black text-blue-700 sm:px-4 sm:py-2 sm:text-sm">{data.school.name}</span>
            <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-black text-slate-600 sm:px-4 sm:py-2 sm:text-sm">{data.school.type}</span>
            {data.school.region && <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-black text-slate-600 sm:px-4 sm:py-2 sm:text-sm">{data.school.region}</span>}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="min-h-10 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-black text-slate-700 shadow-sm outline-none sm:min-h-12 sm:px-4 sm:py-3 sm:text-base">
            {[2025, 2026, 2027].map((y) => <option key={y}>{y}年</option>)}
          </select>
          <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="min-h-10 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-black text-slate-700 shadow-sm outline-none sm:min-h-12 sm:px-4 sm:py-3 sm:text-base">
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => <option key={m} value={m}>{m}月</option>)}
          </select>
        </div>
      </div>
    </section>
  );
}

type LearningMap = {
  courseName: string;
  currentLesson: number;
  currentTitle: string;
  nextTitle: string;
  total: number;
  completion: number;
  items: Array<{ lesson: number; title: string; date?: string; status: "done" | "current" | "todo" }>;
};

function buildLearningMaps(reports: PortalData["reports"], curriculum: PortalData["curriculum"]): LearningMap[] {
  return curriculum.filter((course) => course.items.length > 0).map((course) => {
    const courseReports = reports.filter((row) => row.courseName === course.courseName || row.courseType === course.courseType);
    const currentLesson = courseReports.reduce((max, row) => Math.max(max, extractLesson(row.reportContent)), 0);
    const fallbackLesson = currentLesson || Math.min(...course.items.map((item) => item.lesson));
    const currentItem = course.items.find((item) => item.lesson === fallbackLesson) ?? course.items[0];
    const nextItem = course.items.find((item) => item.lesson > fallbackLesson);
    const reportsByLesson = new Map<number, PortalData["reports"][number]>();
    courseReports.forEach((row) => {
      const lesson = extractLesson(row.reportContent);
      if (lesson && !reportsByLesson.has(lesson)) reportsByLesson.set(lesson, row);
    });
    const completion = Math.min(100, Math.round((fallbackLesson / Math.max(course.items.length, 1)) * 100));
    return {
      courseName: course.courseName,
      currentLesson: fallbackLesson,
      currentTitle: currentItem?.title ?? "尚未開始",
      nextTitle: nextItem?.title ?? "已完成全部進度",
      total: course.items.length,
      completion,
      items: course.items.map((item) => ({
        lesson: item.lesson,
        title: item.title,
        date: reportsByLesson.get(item.lesson)?.date,
        status: item.lesson < fallbackLesson ? "done" : item.lesson === fallbackLesson ? "current" : "todo",
      })),
    };
  });
}

function extractLesson(value: string) {
  const match = (value || "").match(/第\s*(\d+)\s*堂/);
  return match ? Number(match[1]) : 0;
}

function buildSkillMap(rows: PortalData["skillCards"]) {
  return rows.reduce<Record<string, SkillMeta>>((acc, row) => {
    acc[row.name] = {
      icon: row.icon || SKILL_MAP[row.name]?.icon || "•",
      image: row.imageUrl || SKILL_MAP[row.name]?.image,
      description: row.description || SKILL_MAP[row.name]?.description || "",
    };
    return acc;
  }, { ...SKILL_MAP });
}

function OutcomeList({ rows, skillMap }: { rows: PortalData["reports"]; skillMap: Record<string, SkillMeta> }) {
  if (rows.length === 0) return <Empty text="這個月份尚無課程成果回報。" />;
  return (
    <div className="space-y-4">
      {rows.map((row) => (
        <OutcomeCard key={row.id} row={row} skillMap={skillMap} />
      ))}
    </div>
  );
}

function OutcomeCard({ row, skillMap }: { row: PortalData["reports"][number]; skillMap: Record<string, SkillMeta> }) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [imageGenerating, setImageGenerating] = useState(false);
  const [shareImageUrl, setShareImageUrl] = useState("");
  const skills = parseSkillFocus(row.skillFocus || row.aiSkillFocus);
  const progressText = cleanProgressText(row.reportContent);
  const learningPoints = progressText ? translateProgressForParents(progressText, row.courseName).split("\n").filter(Boolean).slice(0, 3) : [];
  const outcomeText = buildParentFriendlyText(row.aiTeachingNote, row.aiSummary, skills);
  const mainText = buildOutcomeDisplayText(progressText, outcomeText, row.courseName, skills);
  const shareText = buildParentShareText(row, mainText, skills);
  const canExpand = mainText.length > 95;

  async function copyShareText() {
    try {
      await navigator.clipboard.writeText(shareText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
      window.prompt("可複製以下內容分享給家長", shareText);
    }
  }

  async function generateShareImage() {
    setImageGenerating(true);
    try {
      const url = await createParentShareImage({ row, skills, mainText, skillMap });
      if (shareImageUrl) URL.revokeObjectURL(shareImageUrl);
      setShareImageUrl(url);
    } catch (e) {
      window.alert((e as Error).message || "產生分享圖片失敗，請稍後再試");
    } finally {
      setImageGenerating(false);
    }
  }

  return (
    <article className="relative overflow-hidden rounded-[22px] border border-slate-200/80 bg-white p-4 shadow-[0_12px_28px_rgba(30,64,175,0.06)] sm:rounded-[24px] sm:p-6">
      <div className="absolute -right-8 -top-8 h-28 w-28 rounded-full bg-blue-50" />
      <div className="relative flex items-start gap-3 sm:gap-4">
        <div className="hidden h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-2xl text-blue-600 sm:flex">▤</div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h3 className="text-lg font-black text-[#142452] sm:text-2xl">{row.courseName}</h3>
              <p className="mt-1 text-xs font-bold leading-5 text-[#7683A0] sm:text-sm">{row.date}｜{row.teacherName}{row.studentCount ? `｜👦 本堂參與：${row.studentCount} 位孩子` : ""}</p>
            </div>
            <span className="hidden w-fit rounded-2xl bg-slate-50 px-4 py-2 text-sm font-black text-slate-500 ring-1 ring-slate-100 sm:inline-flex">成果紀錄</span>
          </div>

          {row.representativePhotoUrl && (
            <div className="mt-3 overflow-hidden rounded-[20px] border border-slate-200 bg-slate-50 sm:mt-5 sm:rounded-[22px]">
              <img src={row.representativePhotoUrl} alt={`${row.courseName}代表照片`} loading="lazy" className="h-[240px] w-full object-cover sm:h-72" />
            </div>
          )}

          {learningPoints.length > 0 && (
            <div className="mt-3 rounded-[18px] border border-blue-100 bg-white p-3 sm:mt-5 sm:rounded-[20px] sm:p-4">
              <div className="text-sm font-black text-[#142452]">今天孩子學習：</div>
              <div className="mt-2 grid gap-2">
                {learningPoints.map((point) => (
                  <div key={point} className="flex items-center gap-2 rounded-2xl bg-blue-50/70 px-3 py-2 text-sm font-black leading-6 text-[#142452]">
                    <span className="text-lg">{firstIcon(point)}</span>
                    <span>{stripLeadingIcon(point)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mt-3 rounded-[18px] border border-blue-100 bg-[#f8fafc] p-3 text-sm leading-7 text-[#142452] sm:mt-5 sm:rounded-[20px] sm:p-4 sm:text-[15px] sm:leading-8">
            <p className={`whitespace-pre-line ${expanded ? "" : "line-clamp-3"}`}>{mainText}</p>
            {canExpand && (
              <button type="button" onClick={() => setExpanded((v) => !v)} className="mt-2 text-sm font-black text-blue-600">
                {expanded ? "收合內容" : "查看更多"}
              </button>
            )}
          </div>

          <SkillCards skills={skills} skillMap={skillMap} />

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {row.incident && <StatusBlock title="特殊事件" text={`${row.incidentChild || "未填孩子"}｜${row.incidentProcess || "未填經過"}｜${row.incidentAction || "未填處理方式"}`} warning />}
          </div>

          <div className="mt-3 rounded-[20px] border border-blue-100 bg-blue-50/40 p-3 sm:mt-5 sm:rounded-[22px] sm:p-4">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="text-sm font-black text-[#142452] sm:text-base">家長分享成果卡</div>
                <div className="mt-0.5 text-xs font-semibold text-slate-500 sm:mt-1 sm:text-sm">快速整理成可轉發內容。</div>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:mt-4 sm:flex sm:flex-wrap sm:gap-3">
              <button type="button" onClick={copyShareText} className="rounded-2xl bg-blue-600 px-3 py-3 text-xs font-black text-white shadow-sm transition hover:bg-blue-700 sm:px-5 sm:text-sm">
                {copied ? "已複製分享文字" : "複製給家長文字"}
              </button>
              <button type="button" onClick={generateShareImage} disabled={imageGenerating} className="rounded-2xl border border-blue-100 bg-white px-3 py-3 text-xs font-black text-blue-600 shadow-sm disabled:cursor-not-allowed disabled:opacity-60 sm:px-5 sm:text-sm">
                {imageGenerating ? "成果卡產生中..." : "產生家長分享圖"}
              </button>
              {shareImageUrl && (
                <a href={shareImageUrl} download={`WaysLeader-${row.school}-${row.courseName}-${row.date}.png`} className="rounded-2xl border border-slate-200 bg-white px-3 py-3 text-center text-xs font-black text-slate-700 shadow-sm sm:px-5 sm:text-sm">
                  下載分享圖
                </a>
              )}
            </div>
            {shareImageUrl && (
              <div className="mt-4 overflow-hidden rounded-[20px] border border-white bg-white shadow-sm">
                <img src={shareImageUrl} alt="家長分享成果卡預覽" className="mx-auto max-h-[520px] w-full object-contain" />
              </div>
            )}
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
    .replace(/課程進度[:：]\s*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function formatProgressLine(value: string, courseName: string) {
  const text = cleanProgressText(value).replace(/^第\s*(\d+)\s*堂\s*/, "第 $1 堂｜");
  const emoji = courseName.includes("足球") ? " ⚽" : courseName.includes("高爾夫") ? " ⛳" : courseName.includes("棒球") ? " ⚾" : "";
  return `${text}${emoji}`;
}

function courseEmoji(courseName: string) {
  if (courseName.includes("足球")) return "⚽";
  if (courseName.includes("籃球")) return "🏀";
  if (courseName.includes("棒球")) return "⚾";
  if (courseName.includes("高爾夫")) return "⛳";
  if (courseName.includes("羽球")) return "🏸";
  if (courseName.includes("冰壺")) return "🥌";
  if (courseName.includes("舞蹈")) return "💃";
  return "🌟";
}

function translateProgressForParents(progressText: string, courseName: string) {
  const text = `${courseName} ${progressText}`;
  const emoji = courseEmoji(courseName);
  const fallback = ["練習基礎動作控制", "提升專注與身體協調", "培養參與感與自信心"];
  const values = text.includes("足球")
    ? ["練習控制足球方向與力道", "學習移動中的身體平衡", "培養專注反應與腳步協調"]
    : text.includes("籃球")
      ? ["練習運球與球感控制", "學習手眼協調與節奏感", "培養輪流等待與團隊合作"]
      : text.includes("棒球")
        ? ["練習傳接球反應", "建立投球與接球基本動作", "培養專注力與觀察能力"]
        : text.includes("高爾夫")
          ? ["練習控制擊球方向與力道", "學習專注與身體穩定", "培養耐心與動作控制"]
          : text.includes("羽球")
            ? ["練習拍面控制與揮拍", "提升反應速度與手眼協調", "建立移動與平衡能力"]
            : text.includes("冰壺")
              ? ["練習推壺方向與距離控制", "學習觀察目標與調整力道", "培養專注力與策略思考"]
              : text.includes("舞蹈")
                ? ["練習身體節奏與肢體表達", "提升協調性與動作記憶", "培養自信與舞台表現"]
                : fallback;
  return values.map((item) => `${emoji} ${item}`).join("\n");
}

function shortProgressTitle(value: string, courseName: string) {
  const cleaned = cleanProgressText(value)
    .replace(/^第\s*\d+\s*堂\s*/, "")
    .replace(/今天孩子學習[:：]?[\s\S]*$/g, "")
    .replace(/能力培養[:：]?[\s\S]*$/g, "")
    .replace(/課堂狀況[:：]?[\s\S]*$/g, "")
    .replace(/課程搭配[\s\S]*$/g, "")
    .replace(/孩子們?[\s\S]*$/g, "")
    .replace(/今天透過[\s\S]*$/g, "")
    .replace(/[。！？].*$/g, "")
    .replace(/[｜|]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[，、：:；;]+$/g, "")
    .trim();
  return cleaned || `${courseName}活動`;
}

function learningStoryForParents(progressText: string, courseName: string) {
  const progress = shortProgressTitle(progressText, courseName);
  const text = `${courseName} ${progress}`;
  if (text.includes("高爾夫")) {
    return `今天透過「${progress}」，孩子練習控制球的方向與速度，也在動作中保持專注與穩定。\n搭配遊戲挑戰與分組互動，孩子能自然建立手眼協調與自信。`;
  }
  if (text.includes("足球")) {
    return `今天透過「${progress}」，孩子練習控制足球方向與力道，也學習在移動中保持平衡。\n搭配遊戲挑戰與分組互動，孩子能在輕鬆參與中累積運動自信。`;
  }
  if (text.includes("籃球")) {
    return `今天透過「${progress}」，孩子練習球感控制與移動節奏，也慢慢熟悉輪流等待。\n搭配遊戲挑戰與分組互動，孩子在活動中更願意主動嘗試。`;
  }
  if (text.includes("棒球")) {
    return `今天透過「${progress}」，孩子練習傳接球反應與基本動作，也學習觀察目標。\n搭配遊戲挑戰與分組互動，孩子在活動中更有參與感。`;
  }
  if (text.includes("冰壺")) {
    return `今天透過「${progress}」，孩子練習推壺方向與距離控制，也學習觀察目標並調整力道。\n搭配遊戲挑戰與分組互動，孩子能在嘗試中找到穩定節奏。`;
  }
  return `今天透過「${progress}」，孩子把動作練習融入遊戲挑戰，也更能理解身體控制與反應。\n搭配互動任務，孩子能在輕鬆參與中累積成就感。`;
}

function stripInternalIncidentText(value: string) {
  return (value || "")
    .replace(/本次課程無特殊事件。?/g, "")
    .replace(/本堂課無特殊事件。?/g, "")
    .replace(/今日課程無特殊事件。?/g, "")
    .replace(/今天課程無特殊事件。?/g, "")
    .replace(/本次課程有特殊事件[^。]*(。[^。]*){0,2}/g, "")
    .replace(/今日有特殊事件[^。]*(。[^。]*){0,2}/g, "")
    .trim();
}

function normalizeReportText(value: string, skills: string[]) {
  const text = stripInternalIncidentText(value)
    .replace(/\s+/g, " ")
    .replace(/今日課程主要進行/g, "今天孩子們挑戰")
    .replace(/本次課程主要進行/g, "今天孩子們挑戰")
    .replace(/本堂課主要進行/g, "今天孩子們挑戰")
    .replace(/本次課程/g, "")
    .replace(/本堂課/g, "")
    .replace(/今日課程/g, "")
    .replace(/本次/g, "")
    .replace(/本堂/g, "")
    .replace(/整體課堂進行順利/g, "課堂進行順利")
    .replace(/(本堂課孩子整體參與狀況良好，能在老師引導下完成指定任務。)\s*\1/g, "$1")
    .trim();
  return text
    .split(/[。！？]/)
    .map((sentence) => softenReportSentence(sentence.trim()))
    .filter(Boolean)
    .filter((sentence, index, list) => list.findIndex((item) => sentenceKey(item) === sentenceKey(sentence)) === index)
    .filter((sentence) => !sentence.includes("能力培養") && !sentence.includes("培養孩子的") && !skills.some((skill) => sentence.includes(`、${skill}`)))
    .slice(0, 2)
    .map((sentence) => `${sentence}。`)
    .join("\n");
}

function softenReportSentence(sentence: string) {
  return sentence
    .replace(/^孩子們?孩子們?/, "孩子們")
    .replace(/孩子能依照老師指令完成練習/g, "孩子能跟著老師完成挑戰")
    .replace(/孩子整體參與狀況良好/g, "今天大家表現很棒")
    .replace(/整體參與狀況良好/g, "大家都很投入")
    .replace(/能在老師引導下完成指定任務/g, "能跟著老師完成挑戰")
    .replace(/透過遊戲化活動與分組練習提升孩子參與度/g, "透過遊戲和分組活動提升參與感")
    .replace(/提升孩子參與度/g, "讓大家更投入")
    .replace(/課堂進行順利/g, "課堂氣氛活潑順利")
    .trim();
}

function sentenceKey(sentence: string) {
  return sentence.replace(/[，、。,.！!？?\s]/g, "").replace(/孩子們?|課程|練習|今天|本次|本堂/g, "");
}

function buildParentFriendlyText(teachingNote: string, summary: string, skills: string[]) {
  const primary = normalizeReportText(teachingNote, skills);
  const secondary = normalizeReportText(summary, skills);
  if (primary && secondary && primary.includes(secondary)) return primary;
  const text = primary || secondary;
  if (text) return text;
  return "孩子們能跟著老師完成指定任務，課堂氣氛活潑順利 ✨";
}

function buildOutcomeDisplayText(progressText: string, _outcomeText: string, courseName: string, _skills: string[]) {
  const story = progressText ? learningStoryForParents(progressText, courseName) : "";
  const participation = "孩子們今天很投入，能跟著老師完成挑戰，也勇於嘗試不同任務，課堂氣氛活潑順利 🎉";
  const lines = [story, participation].filter(Boolean);
  return lines.join("\n\n");
}

function displayClassStatus(value: string) {
  const normalized = value === "很順利" ? "積極參與" : value === "普通" ? "穩定學習" : value === "需要注意" ? "持續練習" : value;
  if (normalized === "積極參與") return "積極參與：孩子能投入課程活動，願意主動嘗試與互動。";
  if (normalized === "穩定學習") return "穩定學習：孩子能跟著老師引導完成課程內容。";
  if (normalized === "持續練習") return "持續練習：孩子仍在熟悉課程內容，需要更多鼓勵與練習。";
  return normalized || "";
}

function buildParentShareText(row: PortalData["reports"][number], mainText: string, skills: string[]) {
  return [
    `【WaysLeader AI｜${row.courseName}學習成果】`,
    `${row.school}｜${row.date}`,
    mainText,
    skills.length ? `能力培養：${skills.join("、")}` : "",
    row.classStatus ? `課堂狀況：${displayClassStatus(row.classStatus)}` : "",
  ].filter(Boolean).join("\n\n");
}

async function createParentShareImage({
  row,
  skills,
  mainText,
  skillMap,
}: {
  row: PortalData["reports"][number];
  skills: string[];
  mainText: string;
  skillMap: Record<string, SkillMeta>;
}) {
  try {
    return await renderShareCanvas({ row, skills, mainText, skillMap, includePhoto: true });
  } catch {
    return await renderShareCanvas({ row, skills, mainText, skillMap, includePhoto: false });
  }
}

async function renderShareCanvas({ row, skills, mainText, skillMap, includePhoto }: { row: PortalData["reports"][number]; skills: string[]; mainText: string; skillMap: Record<string, SkillMeta>; includePhoto: boolean }) {
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1350;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("瀏覽器不支援產生分享圖片");

  ctx.fillStyle = "#F3F8FF";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "#FFFFFF";
  roundRect(ctx, 20, 20, 1040, 1310, 34);
  ctx.fill();
  ctx.strokeStyle = "#D8E8FF";
  ctx.lineWidth = 2;
  ctx.stroke();

  const header = ctx.createLinearGradient(20, 20, 1060, 20);
  header.addColorStop(0, "#60A5FA");
  header.addColorStop(1, "#2563EB");
  ctx.fillStyle = header;
  roundRect(ctx, 20, 20, 1040, 205, 34);
  ctx.fill();

  const logo = await loadCanvasImage(`${window.location.origin}/upbear-logo.png`).catch(() => null);
  if (logo) {
    ctx.save();
    circleClip(ctx, 62, 58, 128);
    drawCover(ctx, logo, 62, 58, 128, 128);
    ctx.restore();
    ctx.strokeStyle = "#FFFFFF";
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(126, 122, 64, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.fillStyle = "#FFFFFF";
  ctx.font = "900 52px -apple-system, BlinkMacSystemFont, 'Noto Sans TC', sans-serif";
  ctx.fillText("WaysLeader AI", 220, 112);
  ctx.font = "800 34px -apple-system, BlinkMacSystemFont, 'Noto Sans TC', sans-serif";
  ctx.fillText("幼兒園學習成果分享卡", 220, 162);

  ctx.font = "800 28px -apple-system, BlinkMacSystemFont, 'Noto Sans TC', sans-serif";
  ctx.fillText(`📅 ${row.date.replaceAll("-", ".")}`, 805, 100);
  ctx.fillStyle = "#FFFFFF";
  roundRect(ctx, 806, 132, 188, 52, 26);
  ctx.fill();
  ctx.fillStyle = "#2563EB";
  ctx.font = "900 28px -apple-system, BlinkMacSystemFont, 'Noto Sans TC', sans-serif";
  ctx.fillText(row.courseName.slice(0, 5), 846, 167);

  ctx.fillStyle = "#FFFFFF";
  roundRect(ctx, 20, 205, 1040, 1125, 32);
  ctx.fill();

  ctx.fillStyle = "#142452";
  ctx.font = "900 54px -apple-system, BlinkMacSystemFont, 'Noto Sans TC', sans-serif";
  ctx.fillText(row.courseName, 70, 305);
  ctx.font = "700 29px -apple-system, BlinkMacSystemFont, 'Noto Sans TC', sans-serif";
  ctx.fillText("今天的學習表現很棒！", 70, 360);

  ctx.strokeStyle = "#A7CBFF";
  ctx.lineWidth = 6;
  ctx.setLineDash([4, 14]);
  ctx.beginPath();
  ctx.moveTo(70, 400);
  ctx.lineTo(455, 400);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = "#3B82F6";
  roundRect(ctx, 70, 438, 430, 64, 8);
  ctx.fill();
  ctx.fillStyle = "#FFFFFF";
  ctx.font = "900 30px -apple-system, BlinkMacSystemFont, 'Noto Sans TC', sans-serif";
  ctx.fillText("今天孩子學習", 142, 480);
  ctx.font = "900 34px -apple-system, BlinkMacSystemFont, 'Noto Sans TC', sans-serif";
  ctx.fillText(courseEmoji(row.courseName), 104, 481);

  const points = shareLearningPoints(row, skills);
  let pointY = 526;
  points.forEach((point, index) => {
    ctx.fillStyle = "#FFFFFF";
    roundRect(ctx, 70, pointY, 430, 82, 41);
    ctx.fill();
    ctx.strokeStyle = "#EEF4FF";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = index === 0 ? "#FEE2E2" : index === 1 ? "#DBEAFE" : "#FEF3C7";
    circle(ctx, 96, pointY + 15, 52);
    ctx.fill();
    ctx.fillStyle = "#142452";
    ctx.font = "800 26px -apple-system, BlinkMacSystemFont, 'Noto Sans TC', sans-serif";
    ctx.fillText(stripLeadingIcon(point), 178, pointY + 51);
    ctx.font = "900 30px -apple-system, BlinkMacSystemFont, 'Noto Sans TC', sans-serif";
    ctx.fillText(firstIcon(point), 110, pointY + 51);
    pointY += 96;
  });

  if (includePhoto && row.representativePhotoUrl) {
    const photo = await loadCanvasImage(row.representativePhotoUrl);
    ctx.save();
    roundRect(ctx, 555, 280, 445, 585, 42);
    ctx.clip();
    drawCover(ctx, photo, 555, 280, 445, 585);
    ctx.restore();
  } else {
    const photoGrad = ctx.createLinearGradient(555, 280, 1000, 865);
    photoGrad.addColorStop(0, "#EFF6FF");
    photoGrad.addColorStop(1, "#DCEBFF");
    ctx.fillStyle = photoGrad;
    roundRect(ctx, 555, 280, 445, 585, 42);
    ctx.fill();
    ctx.fillStyle = "#2563EB";
    ctx.font = "900 96px -apple-system, BlinkMacSystemFont, 'Noto Sans TC', sans-serif";
    ctx.fillText(courseEmoji(row.courseName), 720, 575);
  }

  ctx.strokeStyle = "#FFFFFF";
  ctx.lineWidth = 14;
  roundRect(ctx, 555, 280, 445, 585, 42);
  ctx.stroke();

  ctx.fillStyle = "#EEF6FF";
  roundRect(ctx, 70, 900, 940, 165, 28);
  ctx.fill();
  ctx.fillStyle = "#142452";
  ctx.font = "700 27px -apple-system, BlinkMacSystemFont, 'Noto Sans TC', sans-serif";
  drawWrappedText(ctx, shareStory(row, mainText), 108, 952, 800, 42, 3);
  ctx.fillStyle = "#9ACB63";
  ctx.beginPath();
  ctx.ellipse(915, 1020, 70, 28, -0.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#EF4444";
  ctx.font = "900 48px -apple-system, BlinkMacSystemFont, 'Noto Sans TC', sans-serif";
  ctx.fillText("⛳", 885, 1012);

  ctx.fillStyle = "#F8FBFF";
  roundRect(ctx, 70, 1100, 545, 178, 26);
  ctx.fill();
  ctx.fillStyle = "#1D4ED8";
  ctx.font = "900 30px -apple-system, BlinkMacSystemFont, 'Noto Sans TC', sans-serif";
  ctx.fillText("能力培養", 112, 1140);
  const shownSkills = skills.slice(0, 4);
  for (let index = 0; index < shownSkills.length; index += 1) {
    const skill = shownSkills[index];
    const meta = skillMap[skill];
    const col = index % 2;
    const rowIndex = Math.floor(index / 2);
    const cellX = 105 + col * 250;
    const cellY = 1160 + rowIndex * 56;
    const iconX = cellX;
    const iconY = cellY + 2;
    ctx.fillStyle = ["#DBEAFE", "#DCFCE7", "#F3E8FF", "#FEF3C7"][index % 4];
    circle(ctx, iconX, iconY, 42);
    ctx.fill();
    if (meta?.image) {
      const icon = await loadCanvasImage(meta.image).catch(() => null);
      if (icon) {
        ctx.save();
        circleClip(ctx, iconX, iconY, 42);
        drawCover(ctx, icon, iconX, iconY, 42, 42);
        ctx.restore();
      } else {
        ctx.fillStyle = "#2563EB";
        ctx.font = "900 24px -apple-system, BlinkMacSystemFont, 'Noto Sans TC', sans-serif";
        ctx.fillText(meta.icon || "•", iconX + 8, iconY + 30);
      }
    } else {
      ctx.fillStyle = "#2563EB";
      ctx.font = "900 24px -apple-system, BlinkMacSystemFont, 'Noto Sans TC', sans-serif";
      ctx.fillText(meta?.icon || "•", iconX + 8, iconY + 30);
    }
    ctx.fillStyle = "#142452";
    ctx.font = "800 24px -apple-system, BlinkMacSystemFont, 'Noto Sans TC', sans-serif";
    ctx.fillText(skill, cellX + 58, cellY + 34);
  }

  const status = shortClassStatus(row.classStatus);
  if (status) {
    ctx.fillStyle = "#F8FBFF";
    roundRect(ctx, 640, 1100, 370, 178, 26);
    ctx.fill();
    ctx.fillStyle = "#142452";
    ctx.font = "900 30px -apple-system, BlinkMacSystemFont, 'Noto Sans TC', sans-serif";
    ctx.fillText("課堂狀況", 680, 1140);
    ctx.fillStyle = "#FFFFFF";
    roundRect(ctx, 680, 1168, 290, 82, 30);
    ctx.fill();
    ctx.fillStyle = "#142452";
    ctx.font = "900 28px -apple-system, BlinkMacSystemFont, 'Noto Sans TC', sans-serif";
    ctx.fillText(status.title, 750, 1204);
    ctx.font = "700 20px -apple-system, BlinkMacSystemFont, 'Noto Sans TC', sans-serif";
    ctx.fillStyle = "#475569";
    ctx.fillText(status.caption, 750, 1236);
    ctx.font = "900 48px -apple-system, BlinkMacSystemFont, 'Noto Sans TC', sans-serif";
    ctx.fillText(status.icon, 696, 1231);
  }

  ctx.fillStyle = "#64748B";
  ctx.font = "700 24px -apple-system, BlinkMacSystemFont, 'Noto Sans TC', sans-serif";
  ctx.fillText("用心陪伴・快樂學習・一起成長", 350, 1302);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => {
      if (result) resolve(result);
      else reject(new Error("產生分享圖片失敗"));
    }, "image/png");
  });
  return URL.createObjectURL(blob);
}

function compactShareText(value: string) {
  return value
    .replace(/本次課程|本堂課|今日課程/g, "今天")
    .replace(/本次|本堂/g, "今天")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 8)
    .join("\n");
}

function shareLearningPoints(row: PortalData["reports"][number], skills: string[]) {
  const progress = shortProgressTitle(row.reportContent, row.courseName);
  const course = `${row.courseName} ${progress}`;
  if (course.includes("高爾夫")) return ["🎯 控制擊球方向與力道", "🧠 練習專注與身體穩定", "💗 培養耐心與動作控制"];
  if (course.includes("足球")) return ["⚽ 控制足球方向與力道", "🏃 練習移動平衡與反應", "🤝 培養合作與挑戰精神"];
  if (course.includes("籃球")) return ["🏀 練習運球與球感控制", "👀 提升手眼協調與節奏", "🤝 學習輪流等待與合作"];
  if (course.includes("棒球")) return ["⚾ 練習傳接球反應", "👀 培養觀察與判斷能力", "💪 建立投球基本動作"];
  if (course.includes("冰壺")) return ["🥌 控制推壺方向與力道", "🎯 練習觀察目標位置", "🧠 培養策略思考與專注"];
  if (course.includes("舞蹈")) return ["🎵 練習節奏與身體律動", "💃 提升肢體協調能力", "✨ 培養自信與表現力"];
  const defaults = skills.slice(0, 3).map((skill) => `🌟 ${skill}`);
  return defaults.length ? defaults : ["🌟 練習基礎動作控制", "😊 提升課堂參與感", "🤝 培養合作與自信"];
}

function shareStory(row: PortalData["reports"][number], _mainText: string) {
  const progress = shortProgressTitle(row.reportContent, row.courseName);
  const course = `${row.courseName} ${progress}`;
  if (course.includes("高爾夫")) return `今天透過「${progress}」，孩子練習控制方向與力道，也在遊戲互動中培養專注與穩定。`;
  if (course.includes("足球")) return `今天透過「${progress}」，孩子練習控制方向與移動平衡，也在挑戰中累積運動自信。`;
  if (course.includes("籃球")) return `今天透過「${progress}」，孩子練習球感與節奏，也慢慢建立輪流等待和合作觀念。`;
  if (course.includes("棒球")) return `今天透過「${progress}」，孩子練習傳接球反應，也在互動中提升觀察與專注。`;
  if (course.includes("冰壺")) return `今天透過「${progress}」，孩子練習方向與力道控制，也在遊戲中學習觀察目標。`;
  return `今天透過「${progress}」，孩子在遊戲挑戰中練習動作控制，也慢慢建立合作與自信。`;
}

function firstIcon(value: string) {
  return Array.from(value.trim())[0] || "•";
}

function stripLeadingIcon(value: string) {
  return Array.from(value.trim()).slice(1).join("").trim();
}

function shortClassStatus(value: string) {
  const normalized = value === "很順利" ? "積極參與" : value === "普通" ? "穩定學習" : value === "需要注意" ? "持續練習" : value;
  if (normalized === "積極參與") return { icon: "😊", title: "積極參與", caption: "今天表現很棒" };
  if (normalized === "穩定學習") return { icon: "🙂", title: "穩定學習", caption: "能跟著引導完成" };
  if (normalized === "持續練習") return { icon: "💪", title: "持續練習", caption: "持續鼓勵會更好" };
  return normalized ? { icon: "😊", title: normalized, caption: "持續快樂學習" } : null;
}

function loadCanvasImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("圖片無法載入"));
    img.src = src;
  });
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function circle(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  ctx.closePath();
}

function circleClip(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
}

function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const sw = w / scale;
  const sh = h / scale;
  const sx = (img.naturalWidth - sw) / 2;
  const sy = (img.naturalHeight - sh) / 2;
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

function drawWrappedText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number, maxLines = 99) {
  const paragraphs = text.split("\n");
  let lines = 0;
  let currentY = y;
  for (const paragraph of paragraphs) {
    let line = "";
    for (const char of paragraph) {
      const test = line + char;
      if (ctx.measureText(test).width > maxWidth && line) {
        ctx.fillText(line, x, currentY);
        currentY += lineHeight;
        lines += 1;
        line = char;
        if (lines >= maxLines) return currentY;
      } else {
        line = test;
      }
    }
    if (line) {
      ctx.fillText(line, x, currentY);
      currentY += lineHeight;
      lines += 1;
      if (lines >= maxLines) return currentY;
    }
    currentY += 8;
  }
  return currentY;
}

function SkillCards({ skills, skillMap }: { skills: string[]; skillMap: Record<string, SkillMeta> }) {
  if (skills.length === 0) return null;
  return (
    <section className="mt-3 rounded-[20px] border border-slate-200/80 bg-white p-3 shadow-[0_10px_26px_rgba(30,64,175,0.04)] sm:mt-5 sm:rounded-[24px] sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-black tracking-wide text-[#142452] sm:text-base">孩子在課程中可以學習到</div>
        <div className="hidden rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-600 sm:block">能力培養</div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:mt-4 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
        {skills.map((skill) => {
          const meta = skillMap[skill];
          return (
            <div key={skill} className="flex aspect-square w-full flex-col items-center justify-center rounded-[20px] bg-[#f8fafc] p-3 text-center shadow-[0_8px_20px_rgba(30,64,175,0.04)] ring-1 ring-slate-200/80 sm:rounded-[24px] sm:p-5">
              {meta?.image ? (
                <img src={meta.image} alt={skill} loading="lazy" className="h-16 w-16 rounded-full object-cover ring-4 ring-white shadow-sm sm:h-20 sm:w-20 lg:h-[86px] lg:w-[86px]" />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-blue-50 text-4xl font-black text-blue-600 shadow-inner sm:h-20 sm:w-20 sm:text-5xl lg:h-[86px] lg:w-[86px]">{meta?.icon ?? "•"}</div>
              )}
              <div className="mt-2 text-sm font-black leading-tight text-[#142452] sm:mt-3 sm:text-lg">{skill}</div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function LearningMaps({ maps, compact = false }: { maps: LearningMap[]; compact?: boolean }) {
  if (maps.length === 0) return <Empty text="尚無課程進度資料。" />;
  return (
    <div className="space-y-5">
      {maps.map((map) => (
        <article key={map.courseName} className="overflow-hidden rounded-[22px] border border-slate-200/80 bg-white p-3 shadow-[0_12px_28px_rgba(30,64,175,0.06)] sm:rounded-[26px] sm:p-6">
          <CourseOverview map={map} />
          <div className={`relative mt-6 space-y-3 pl-1 sm:pl-3 ${compact ? "hidden" : ""}`}>
            <div className="absolute bottom-4 left-7 top-4 w-0.5 bg-slate-200 sm:left-9" />
            {map.items.map((item) => <LessonNode key={`${map.courseName}-${item.lesson}`} item={item} />)}
          </div>
        </article>
      ))}
    </div>
  );
}

function CourseOverview({ map }: { map: LearningMap }) {
  return (
    <div className="rounded-[20px] border border-blue-100 bg-gradient-to-br from-blue-50 to-white p-3 sm:rounded-[24px] sm:p-5">
      <div className="flex items-center gap-3 sm:items-start sm:gap-4">
        <div className="relative flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-blue-100 sm:h-24 sm:w-24">
          <div
            className="absolute inset-0 rounded-full"
            style={{ background: `conic-gradient(#2563eb ${map.completion * 3.6}deg, #e2e8f0 0deg)` }}
          />
          <div className="absolute inset-2 rounded-full bg-white" />
          <div className="relative text-center">
            <div className="text-lg font-black text-blue-600 sm:text-2xl">{map.completion}%</div>
            <div className="text-[9px] font-black text-slate-400 sm:text-[10px]">完成度</div>
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-black tracking-wide text-blue-600 sm:text-sm">{map.courseName}學習路線</div>
          <h3 className="mt-0.5 text-lg font-black leading-snug text-[#142452] sm:mt-1 sm:text-2xl">
            第 {map.currentLesson} / {map.total} 堂
          </h3>
          <p className="mt-0.5 line-clamp-1 text-xs font-bold leading-5 text-slate-600 sm:mt-1 sm:text-sm sm:leading-6">目前進度：{map.currentTitle}</p>
          <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-white ring-1 ring-blue-100 sm:mt-4 sm:h-3">
            <div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${map.completion}%` }} />
          </div>
          <p className="mt-1 line-clamp-1 text-[11px] font-bold text-slate-500 sm:mt-2 sm:text-xs">下一階段：{map.nextTitle}</p>
        </div>
      </div>
    </div>
  );
}

function LessonNode({ item }: { item: LearningMap["items"][number] }) {
  const style = item.status === "done"
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : item.status === "current"
      ? "border-blue-300 bg-blue-600 text-white shadow-[0_12px_30px_rgba(37,99,235,0.22)]"
      : "border-slate-200 bg-slate-50 text-slate-400 opacity-75";
  const icon = item.status === "done" ? "✓" : item.status === "current" ? "●" : "○";
  const statusText = item.status === "done" ? "已完成" : item.status === "current" ? "進行中" : "未開始";
  return (
    <div className="relative flex gap-4">
      <div className={`z-10 flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-lg font-black ring-4 ring-white sm:h-14 sm:w-14 ${item.status === "current" ? "bg-blue-600 text-white" : item.status === "done" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-400"}`}>{icon}</div>
      <div className={`min-w-0 flex-1 rounded-[20px] border px-4 py-3 transition ${style}`}>
        <div className="flex flex-wrap items-center gap-2 text-xs font-black opacity-85">
          <span>第 {item.lesson} 堂</span>
          <span>・</span>
          <span>{statusText}</span>
          {item.date && (
            <>
              <span>・</span>
              <span>{item.date}</span>
            </>
          )}
        </div>
        <div className="mt-1 line-clamp-2 text-base font-black leading-6">{item.title}</div>
      </div>
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
    <div className="relative overflow-hidden rounded-[16px] bg-white p-2.5 text-center shadow-[0_10px_24px_rgba(30,64,175,0.05)] ring-1 ring-slate-200/80 sm:rounded-[22px] sm:p-5 sm:text-left">
      <div className="mx-auto flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 text-sm font-black text-blue-600 sm:mx-0 sm:h-14 sm:w-14 sm:rounded-2xl sm:text-xl">{icon}</div>
      <div className="mt-2 line-clamp-1 text-[11px] font-black text-[#142452] sm:mt-4 sm:text-sm">{label}</div>
      <div className="mt-0.5 text-xl font-black text-blue-600 sm:mt-1 sm:text-4xl">{value.toLocaleString("zh-TW")}</div>
      <div className="hidden mt-1 text-xs font-semibold text-slate-400 sm:block">{helper}</div>
    </div>
  );
}

function PanelTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <h2 className="text-xl font-black text-[#142452] sm:text-2xl">{title}</h2>
      <p className="mt-0.5 text-xs font-medium text-[#7683A0] sm:mt-1 sm:text-sm">{subtitle}</p>
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
      <div className="mt-3 text-center text-lg font-black text-slate-900">WaysLeader AI</div>
      <div className="mt-1 text-xs font-bold text-slate-500">幼兒園學習成果平台</div>
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
