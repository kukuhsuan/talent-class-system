"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useDepartment } from "@/lib/departmentContext";
import { StatCard, StatusTag, type Tone } from "@/components/ui";
import { taipeiDateIso } from "@/lib/courseDates";
import { courseLabel } from "@/lib/courseMeta";

const DAY_NAMES = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];

type DashboardStats = {
  todayCourseCount: number;
  todaySubstituteCount: number;
  pendingFillableCount: number;
  pendingOverdueCount: number;
  pendingSubstituteCount: number;
  pendingSubstitutePastCount: number;
  unboundTeacherCount: number;
  teacherCount: number;
  courseChanges: Record<string, number>;
};
type PendingDetail = {
  id: number;
  school: string;
  courseType: string;
  date: string;
  teacherName: string;
  teacherLineUserId: string | null;
  time: string;
  missingItems: string[];
  overdueDays: number;
};
type EquipmentItem = {
  id: number;
  time: string;
  school: string;
  courseType: string;
  teacherName: string;
  reminderLabels: string[];
  nextStop: string;
  status: string;
};
type BriefingItem = {
  id: number; targetDate: string; school: string; courseType: string; courseTime: string;
  teacherName: string; content: string; ackAt: string | null; status: string;
};
type AutomationHealth = {
  jobKey: string;
  targetDate: string;
  status: "success" | "partial" | "failed";
  total: number;
  success: number;
  failed: number;
  details: string;
  ranAt: string;
};

const EMPTY_STATS: DashboardStats = {
  todayCourseCount: 0,
  todaySubstituteCount: 0,
  pendingFillableCount: 0,
  pendingOverdueCount: 0,
  pendingSubstituteCount: 0,
  pendingSubstitutePastCount: 0,
  unboundTeacherCount: 0,
  teacherCount: 0,
  courseChanges: {},
};

export default function Home() {
  const { dept } = useDepartment();
  const [seeded, setSeeded] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [stats, setStats] = useState<DashboardStats>(EMPTY_STATS);
  const [pendingDetails, setPendingDetails] = useState<PendingDetail[]>([]);
  const [equipmentItems, setEquipmentItems] = useState<EquipmentItem[]>([]);
  const [briefingItems, setBriefingItems] = useState<BriefingItem[]>([]);
  const [automationHealth, setAutomationHealth] = useState<AutomationHealth[]>([]);
  const [loading, setLoading] = useState(true);
  const [reminding, setReminding] = useState<number | null>(null);
  const [remindedIds, setRemindedIds] = useState<Set<number>>(new Set());
  const [courseReminderSending, setCourseReminderSending] = useState<0 | 1 | null>(null);

  const now = new Date();
  const todayStr = taipeiDateIso(now);
  const todayDayName = DAY_NAMES[now.getDay()];
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const dateDisplay = `${year}年${month}月${now.getDate()}日 ${todayDayName}`;

  useEffect(() => {
    let cancelled = false;
    async function load(showLoading = false) {
      if (showLoading) setLoading(true);
      const params = new URLSearchParams({ year: String(year), month: String(month), today: todayStr });
      if (dept) params.set("dept", dept);
      const briefingTo = taipeiDateIso(new Date(Date.now() + 15 * 86400000));
      const [data, briefings] = await Promise.all([
        fetch(`/api/dashboard?${params}`, { cache: "no-store" }).then((r) => r.json()),
        fetch(`/api/course-briefings?from=${todayStr}&to=${briefingTo}`, { cache: "no-store" })
          .then((r) => r.ok ? r.json() : []),
      ]);
      if (cancelled) return;

      setStats({
        todayCourseCount: Number(data.todayCourseCount ?? 0),
        todaySubstituteCount: Number(data.todaySubstituteCount ?? 0),
        pendingFillableCount: Number(data.pendingFillableCount ?? 0),
        pendingOverdueCount: Number(data.pendingOverdueCount ?? 0),
        pendingSubstituteCount: Number(data.pendingSubstituteCount ?? 0),
        pendingSubstitutePastCount: Number(data.pendingSubstitutePastCount ?? 0),
        unboundTeacherCount: Number(data.unboundTeacherCount ?? 0),
        teacherCount: Number(data.teacherCount ?? 0),
        courseChanges: data.courseChanges ?? {},
      });
      setPendingDetails(Array.isArray(data.pendingDetails) ? data.pendingDetails.slice(0, 5) : []);
      setEquipmentItems(Array.isArray(data.equipment?.items) ? data.equipment.items : []);
      setBriefingItems(Array.isArray(briefings) ? briefings.filter((item: BriefingItem) => item.status === "pending").slice(0, 5) : []);
      setAutomationHealth(Array.isArray(data.automationHealth) ? data.automationHealth : []);
      setSeeded(Number(data.teacherCount ?? 0) > 0);
      setLoading(false);
    }
    function refreshWhenVisible() {
      if (document.visibilityState === "visible") void load();
    }
    void load(true);
    const refreshTimer = window.setInterval(refreshWhenVisible, 30_000);
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      cancelled = true;
      window.clearInterval(refreshTimer);
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [dept, year, month, todayStr]);

  const handleRemind = async (attendanceId: number) => {
    setReminding(attendanceId);
    const response = await fetch("/api/line/push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "report_request", attendanceId }),
    });
    if (response.ok) setRemindedIds((prev) => new Set(prev).add(attendanceId));
    else alert((await response.json().catch(() => ({}))).error ?? "提醒傳送失敗");
    setReminding(null);
  };

  const handleSeed = async () => {
    setSeeding(true);
    await fetch("/api/seed", { method: "POST" });
    setSeeding(false);
    window.location.reload();
  };

  const handleCourseReminder = async (dayOffset: 0 | 1) => {
    const label = dayOffset === 1 ? "明日" : "今日";
    if (!window.confirm(`確定要立即補發「${label}課程提醒」嗎？\n課表沒變動的老師會自動略過；排程後才加課的會重新收到。`)) return;
    setCourseReminderSending(dayOffset);
    try {
      const response = await fetch("/api/line/course-reminder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dayOffset }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "提醒傳送失敗");
      alert(`「${label}課程提醒」處理完成\n成功：${data.sent ?? 0} 位${data.resent ? `（其中 ${data.resent} 位是課表有更新重發）` : ""}\n課表未變動略過：${data.skippedAlreadySent ?? 0} 位\n未綁 LINE：${data.skippedNoLine ?? 0} 位${data.errors?.length ? `\n失敗：${data.errors.length} 位` : ""}\n\n單獨補發某位老師請到「客服通知中心 → 老師 LINE 綁定」。`);
    } catch (error) {
      alert(error instanceof Error ? error.message : "提醒傳送失敗");
    } finally {
      setCourseReminderSending(null);
    }
  };

  const cards: Array<{ label: string; value: number; href: string; tone: Tone | "default" }> = [
    { label: "今日課程", value: stats.todayCourseCount, href: "/schedule", tone: "info" },
    { label: "今日代課", value: stats.todaySubstituteCount, href: "/substitutes", tone: "info" },
    { label: "待回報數量", value: stats.pendingFillableCount, href: "/attendance?status=missing", tone: stats.pendingOverdueCount > 0 ? "err" : "warn" },
    // 待指派代課＝這堂課沒有人會去上。已經過去的課一律紅色：那不是還來得及找人，是已經開了天窗。
    { label: "待指派代課", value: stats.pendingSubstituteCount, href: "/attendance?status=unassigned", tone: stats.pendingSubstitutePastCount > 0 ? "err" : stats.pendingSubstituteCount > 0 ? "warn" : "idle" },
    { label: "LINE 未綁定", value: stats.unboundTeacherCount, href: "/notify", tone: "idle" },
  ];
  const formatDate = (iso: string) => {
    const [, month, day] = iso.slice(0, 10).split("-");
    return `${Number(month)}/${Number(day)}`;
  };
  const tomorrowStr = taipeiDateIso(new Date(now.getTime() + 86400000));
  const automationCards = [
    { jobKey: "teacher-reminder:0", targetDate: todayStr, label: "今日老師提醒", time: "07:00" },
    { jobKey: "teacher-reminder:1", targetDate: tomorrowStr, label: "明日老師提醒", time: "14:00" },
    { jobKey: "operations-daily:0", targetDate: todayStr, label: "今日營運班表", time: "06:50" },
    { jobKey: "operations-daily:1", targetDate: tomorrowStr, label: "明日營運班表", time: "14:50" },
  ].map((card) => ({
    ...card,
    run: automationHealth.find((run) => run.jobKey === card.jobKey && run.targetDate.slice(0, 10) === card.targetDate),
  }));

  return (
    <div>
      <div className="mb-5 md:mb-6">
        <h1 className="text-xl md:text-2xl font-bold text-slate-800">WaysLeader AI</h1>
        <p className="text-slate-500 text-sm mt-1">幼兒園學習成果平台｜{dateDisplay}</p>
      </div>

      {!seeded && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 md:p-5 mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="font-semibold text-amber-800">首次使用 — 匯入現有資料</p>
            <p className="text-sm text-amber-600 mt-1">點選右方按鈕，將 Excel 表格中的老師和課程資料匯入系統</p>
          </div>
          <button onClick={handleSeed} disabled={seeding}
            className="bg-amber-500 hover:bg-amber-600 text-white font-medium px-5 py-3 md:py-2.5 rounded-lg transition-colors disabled:opacity-50 whitespace-nowrap md:ml-4">
            {seeding ? "匯入中..." : "匯入資料"}
          </button>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 md:p-5">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="font-semibold text-slate-800">今日概況</h2>
            <p className="text-sm text-slate-500 mt-1">自動提醒：今日 07:00、明日 14:00；需要時也可手動補發。</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => handleCourseReminder(0)}
              disabled={courseReminderSending !== null}
              className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-50"
            >
              {courseReminderSending === 0 ? "發送中…" : "發送今日提醒"}
            </button>
            <button
              onClick={() => handleCourseReminder(1)}
              disabled={courseReminderSending !== null}
              className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
            >
              {courseReminderSending === 1 ? "發送中…" : "發送明日提醒"}
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {cards.map((card) => (
            <StatCard key={card.label} label={card.label} value={card.value} href={card.href} tone={card.tone} loading={loading} />
          ))}
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-emerald-100 bg-white shadow-sm">
        <div className="border-b border-emerald-50 px-4 py-4">
          <h2 className="font-semibold text-slate-800">自動排程健康狀態</h2>
          <p className="mt-1 text-sm text-slate-500">可立即確認老師提醒與營運班表是否正常完成。</p>
        </div>
        <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
          {automationCards.map(({ jobKey, targetDate, label, time, run }) => {
            const statusLabel = !run ? "尚未執行" : run.status === "success" ? "正常" : run.status === "partial" ? "部分失敗" : "執行失敗";
            return (
              <div key={`${jobKey}:${targetDate}`} className="rounded-xl border border-slate-200 bg-white p-3" title={run?.details || ""}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-bold text-slate-800">{label}</span>
                  <StatusTag size="sm">{statusLabel}</StatusTag>
                </div>
                <div className="mt-2 text-xs text-slate-500">預定 {time}</div>
                {run && <div className="mt-1 text-xs font-semibold text-slate-600">成功 {run.success}／{run.total}{run.failed ? `・失敗 ${run.failed}` : ""}</div>}
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-indigo-100 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-indigo-50 px-4 py-4">
          <div>
            <h2 className="font-semibold text-slate-800">近期課程交辦</h2>
            <p className="mt-1 text-sm text-slate-500">未來 15 天的課程提醒與老師確認狀況。</p>
          </div>
          <Link href="/course-briefings" className="text-sm font-semibold text-indigo-700">管理交辦</Link>
        </div>
        {briefingItems.length === 0 ? (
          <div className="px-4 py-7 text-center text-sm text-slate-400">目前沒有待執行的課前交辦</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {briefingItems.map((item) => (
              <Link key={item.id} href="/course-briefings" className="grid gap-2 px-4 py-4 hover:bg-indigo-50/40 md:grid-cols-[110px_1fr_auto] md:items-center">
                <div className="font-bold text-indigo-700">{formatDate(item.targetDate)}</div>
                <div className="min-w-0">
                  <div className="font-semibold text-slate-800">{item.school}｜{item.courseType}｜{item.teacherName}</div>
                  <div className="mt-1 truncate text-sm text-slate-500">{item.content}</div>
                </div>
                <StatusTag tone={item.ackAt ? "ok" : "warn"}>{item.ackAt ? "老師已確認" : "尚未確認"}</StatusTag>
              </Link>
            ))}
          </div>
        )}
      </div>

      {Object.values(stats.courseChanges).some((value) => value > 0) && (
        <div className="mt-6 rounded-xl border border-cyan-100 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-cyan-50 px-4 py-4">
            <div><h2 className="font-semibold text-slate-800">課程異動待處理</h2><p className="mt-1 text-sm text-slate-500">園所申請、老師回覆與尚未套用的異動集中處理。</p></div>
            <Link href="/course-change-requests" className="text-sm font-semibold text-cyan-700">查看異動中心</Link>
          </div>
          <div className="grid grid-cols-2 gap-3 p-4 md:grid-cols-5">
            {[["待行政審核", "待行政審核"], ["待老師回覆", "待老師回覆"], ["老師無法配合", "無法配合"], ["需要討論", "需要討論"], ["老師可配合", "同意待套用"]].map(([key, label]) => (
              <Link key={key} href={`/course-change-requests?status=${encodeURIComponent(key)}`} className="rounded-lg bg-cyan-50 px-3 py-3 text-cyan-900">
                <div className="text-xs font-medium text-cyan-700">{label}</div><div className="mt-1 text-2xl font-bold">{stats.courseChanges[key] ?? 0}</div>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="mt-6 rounded-xl border border-amber-100 bg-white shadow-sm">
        <div className="flex flex-col gap-2 border-b border-amber-50 px-4 py-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="font-semibold text-slate-800">待回報明細</h2>
            <p className="text-sm text-slate-500">
              近 30 天未回報的課，逾期最久的排在前面。只顯示前 5 筆，完整清單請到上課紀錄查看。
              {stats.pendingOverdueCount > 0 && (
                <span className="ml-1 font-medium text-red-600">其中 {stats.pendingOverdueCount} 筆已逾期 3 天以上。</span>
              )}
            </p>
          </div>
          {stats.pendingFillableCount > 5 && (
            <Link href="/attendance?status=missing" className="text-sm font-medium text-amber-700 hover:underline">
              查看其餘 {stats.pendingFillableCount - 5} 筆待回報
            </Link>
          )}
        </div>
        {loading ? (
          <div className="space-y-3 p-4">
            {[1, 2, 3].map((i) => <div key={i} className="h-16 rounded-lg bg-slate-100 animate-pulse" />)}
          </div>
        ) : pendingDetails.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-slate-400">目前沒有待回報事項</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {pendingDetails.map((item) => {
              const hasLine = Boolean(item.teacherLineUserId);
              const reminded = remindedIds.has(item.id);
              const isSending = reminding === item.id;
              return (
                <div key={item.id} className="grid gap-2 px-4 py-4 md:grid-cols-[1.2fr_1fr_auto_auto] md:items-center">
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-900">{item.school}</div>
                    <div className="mt-1 text-sm text-slate-500">{courseLabel(item.courseType)} · {item.teacherName}</div>
                  </div>
                  <div className="text-sm text-slate-600">
                    <span className="font-medium">{formatDate(item.date)}</span>
                    {item.time && <span className="ml-2 text-slate-400">{item.time}</span>}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {item.missingItems.map((label) => (
                      <StatusTag key={label} tone={item.overdueDays >= 3 ? "err" : "warn"} size="sm">{label}</StatusTag>
                    ))}
                    {item.overdueDays >= 3 && (
                      <StatusTag tone="err" size="sm">逾期 {item.overdueDays} 天</StatusTag>
                    )}
                  </div>
                  <div className="flex justify-end">
                    {/* 回報連結下課後 48 小時就失效，逾期再推提醒只會給老師一個打不開的連結，
                        這時要走後台補登，不是再催一次。 */}
                    {item.overdueDays >= 2 ? (
                      <Link href="/attendance?status=missing" className="rounded-lg bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100 transition-colors">
                        連結已過期 · 後台補登
                      </Link>
                    ) : !hasLine ? (
                      <span className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs text-slate-400 cursor-default">
                        老師未綁 LINE
                      </span>
                    ) : reminded ? (
                      <span className="rounded-lg bg-green-50 px-3 py-1.5 text-xs font-medium text-green-600">
                        ✓ 已提醒
                      </span>
                    ) : (
                      <button
                        onClick={() => handleRemind(item.id)}
                        disabled={isSending}
                        className="rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-50 transition-colors"
                      >
                        {isSending ? "發送中…" : "提醒老師回報"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {stats.pendingFillableCount > 0 && stats.pendingFillableCount <= 5 && (
          <div className="border-t border-slate-100 px-4 py-3 text-right">
            <Link href="/attendance?status=missing" className="text-sm font-medium text-amber-700 hover:underline">
              前往上課紀錄
            </Link>
          </div>
        )}
      </div>

      {equipmentItems.length > 0 && (
        <div className="mt-6 rounded-xl border border-indigo-100 bg-white shadow-sm">
          <div className="border-b border-indigo-50 px-4 py-4">
            <h2 className="font-semibold text-slate-800">📦 今日器材提醒</h2>
            <p className="text-sm text-slate-500">今日需確認器材或組裝的課程。</p>
          </div>
          <div className="divide-y divide-slate-100">
            {equipmentItems.map((item) => {
              const cannotHelp = item.status === "無法協助";
              return (
                <div key={item.id} className={`grid gap-2 px-4 py-4 md:grid-cols-[auto_1.2fr_1fr_1fr_auto] md:items-center ${cannotHelp ? "bg-rose-50/60" : ""}`}>
                  <div className="text-sm font-medium text-slate-600 md:w-24">{item.time || "-"}</div>
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-900">{item.school}</div>
                    <div className="mt-1 text-sm text-slate-500">{courseLabel(item.courseType)} · {item.teacherName}</div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {item.reminderLabels.map((label) => (
                      <span key={label} className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-600">{label}</span>
                    ))}
                  </div>
                  <div className="text-sm text-slate-600">
                    {item.nextStop ? <><span className="text-xs text-slate-400">下一站</span> {item.nextStop}</> : <span className="text-slate-300">-</span>}
                  </div>
                  <div className="flex md:justify-end">
                    <StatusTag tone={cannotHelp ? "err" : item.status === "待確認" ? "warn" : "ok"}>{item.status}</StatusTag>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
