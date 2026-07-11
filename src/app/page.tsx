"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useDepartment } from "@/lib/departmentContext";
import { taipeiDateIso } from "@/lib/courseDates";
import { courseLabel } from "@/lib/courseMeta";

const DAY_NAMES = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];

type DashboardStats = {
  todayCourseCount: number;
  todaySubstituteCount: number;
  pendingFillableCount: number;
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

const EMPTY_STATS: DashboardStats = {
  todayCourseCount: 0,
  todaySubstituteCount: 0,
  pendingFillableCount: 0,
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
  const [loading, setLoading] = useState(true);
  const [reminding, setReminding] = useState<number | null>(null);
  const [remindedIds, setRemindedIds] = useState<Set<number>>(new Set());

  const now = new Date();
  const todayStr = taipeiDateIso(now);
  const todayDayName = DAY_NAMES[now.getDay()];
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const dateDisplay = `${year}年${month}月${now.getDate()}日 ${todayDayName}`;

  useEffect(() => {
    async function load() {
      setLoading(true);
      const params = new URLSearchParams({ year: String(year), month: String(month), today: todayStr });
      if (dept) params.set("dept", dept);
      const data = await fetch(`/api/dashboard?${params}`).then((r) => r.json());

      setStats({
        todayCourseCount: Number(data.todayCourseCount ?? 0),
        todaySubstituteCount: Number(data.todaySubstituteCount ?? 0),
        pendingFillableCount: Number(data.pendingFillableCount ?? 0),
        unboundTeacherCount: Number(data.unboundTeacherCount ?? 0),
        teacherCount: Number(data.teacherCount ?? 0),
        courseChanges: data.courseChanges ?? {},
      });
      setPendingDetails(Array.isArray(data.pendingDetails) ? data.pendingDetails.slice(0, 5) : []);
      setEquipmentItems(Array.isArray(data.equipment?.items) ? data.equipment.items : []);
      setSeeded(Number(data.teacherCount ?? 0) > 0);
      setLoading(false);
    }
    load();
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

  const cards = [
    { label: "今日課程", value: stats.todayCourseCount, href: "/schedule", tone: "blue" },
    { label: "今日代課", value: stats.todaySubstituteCount, href: "/substitutes", tone: "orange" },
    { label: "待回報數量", value: stats.pendingFillableCount, href: "/attendance?status=missing", tone: "amber" },
    { label: "LINE 未綁定", value: stats.unboundTeacherCount, href: "/notify", tone: "slate" },
  ];

  const toneClass: Record<string, string> = {
    blue: "bg-blue-50 text-blue-700 border-blue-100 hover:bg-blue-100",
    orange: "bg-orange-50 text-orange-700 border-orange-100 hover:bg-orange-100",
    amber: "bg-amber-50 text-amber-700 border-amber-100 hover:bg-amber-100",
    slate: "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100",
    rose: "bg-rose-50 text-rose-700 border-rose-100 hover:bg-rose-100",
  };
  const formatDate = (iso: string) => {
    const [, month, day] = iso.slice(0, 10).split("-");
    return `${Number(month)}/${Number(day)}`;
  };

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
        <div className="mb-4">
          <h2 className="font-semibold text-slate-800">今日概況</h2>
          <p className="text-sm text-slate-500 mt-1">首頁只顯示必要數量與前 5 筆待處理明細。</p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {cards.map((card) => (
            <Link key={card.label} href={card.href}
              className={`rounded-xl border px-4 py-4 transition-colors ${toneClass[card.tone]}`}>
              <div className="text-xs font-medium opacity-80">{card.label}</div>
              {loading
                ? <div className="mt-3 h-8 w-12 rounded-lg bg-white/70 animate-pulse" />
                : <div className="mt-1 text-3xl font-bold">{card.value}</div>}
            </Link>
          ))}
        </div>
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
            <p className="text-sm text-slate-500">只顯示前 5 筆，完整清單請到出勤紀錄查看。</p>
          </div>
          {stats.pendingFillableCount > 5 && (
            <Link href="/attendance?status=missing" className="text-sm font-medium text-amber-700 hover:underline">
              查看更多待回報
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
                      <span key={label} className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
                        {label}
                      </span>
                    ))}
                  </div>
                  <div className="flex justify-end">
                    {!hasLine ? (
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
              前往出勤紀錄
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
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                      cannotHelp ? "bg-rose-100 text-rose-700"
                      : item.status === "待確認" ? "bg-amber-50 text-amber-700"
                      : "bg-green-50 text-green-700"
                    }`}>{item.status}</span>
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
