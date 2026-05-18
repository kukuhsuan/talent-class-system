"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useDepartment } from "@/lib/departmentContext";
import { courseLabel } from "@/lib/courseMeta";

type Teacher = { id: number; name: string };
type Course = { id: number; code?: string; school: string; courseType: string; teacher: Teacher; teacherId: number; category?: string; dayOfWeek?: string; time: string; region?: string; address?: string };
type Attendance = { id: number; date: string; course: Course; actualTeacher: Teacher; studentCount: number | null; cancelled: boolean; category: string; hours: number; notes: string; reportContent?: string; reportSentAt?: string | null };

const DAY_NAMES = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];

export default function Home() {
  const { dept } = useDepartment();
  const [seeded, setSeeded] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [todayCourses, setTodayCourses] = useState<Course[]>([]);
  const [todayAttendance, setTodayAttendance] = useState<Attendance[]>([]);
  const [unboundTeachers, setUnboundTeachers] = useState<Array<{ id: number; name: string; phone?: string }>>([]);
  const [sendingReport, setSendingReport] = useState<number | null>(null);
  const [stats, setStats] = useState({ teachers: 0, courses: 0, monthAttendance: 0 });
  const [loading, setLoading] = useState(true);

  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const todayDayName = DAY_NAMES[now.getDay()];
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const dateDisplay = `${year}年${month}月${now.getDate()}日 ${todayDayName}`;

  useEffect(() => {
    async function load() {
      const params = new URLSearchParams({ year: String(year), month: String(month) });
      if (dept) params.set("dept", dept);
      const data = await fetch(`/api/dashboard?${params}`).then((r) => r.json());

      const courses: Course[] = data.courses ?? [];
      const attendance: Attendance[] = data.attendance ?? [];
      const teacherCount: number = data.teacherCount ?? 0;

      const todayA = attendance.filter((a) => a.date.slice(0, 10) === todayStr);
      const fromWeekday = courses.filter((c) => c.dayOfWeek === todayDayName);
      const fromScheduled = courses.filter((c) => todayA.some((a) => a.course.id === c.id));
      const todayC = [...fromWeekday, ...fromScheduled].filter(
        (c, i, arr) => arr.findIndex((x) => x.id === c.id) === i,
      );
      const monthCount = attendance.filter((a) => !a.cancelled).length;

      setTodayCourses(todayC);
      setTodayAttendance(todayA);
      setUnboundTeachers(data.unboundTeachers ?? []);
      setStats({ teachers: teacherCount, courses: courses.length, monthAttendance: monthCount });
      setSeeded(teacherCount > 0);
      setLoading(false);
    }
    load();
  }, [dept, year, month, todayStr, todayDayName]);

  function getAttendanceForCourse(courseId: number) {
    return todayAttendance.find((a) => a.course.id === courseId);
  }

  const todaySubstitutes = todayAttendance.filter((a) => !a.cancelled && a.actualTeacher.id !== a.course.teacherId);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const isPastTime = (time?: string) => {
    const m = (time ?? "").match(/(\d{1,2}):(\d{2})/);
    if (!m) return true;
    return Number(m[1]) * 60 + Number(m[2]) <= nowMinutes;
  };
  const pendingReports = todayAttendance.filter((a) =>
    !a.cancelled &&
    isPastTime(a.course.time) &&
    (a.studentCount == null || !(a.reportContent ?? "").trim())
  );
  const unnotified = todayAttendance.filter((a) => !a.cancelled && !a.reportSentAt);

  async function sendReportReminder(attendanceId: number) {
    setSendingReport(attendanceId);
    const res = await fetch("/api/line/push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "report_request", attendanceId }),
    });
    setSendingReport(null);
    alert(res.ok ? "已發送 LINE 回報提醒" : "發送失敗，請確認老師是否已綁定 LINE");
  }

  const handleSeed = async () => {
    setSeeding(true);
    await fetch("/api/seed", { method: "POST" });
    setSeeding(false);
    window.location.reload();
  };

  return (
    <div>
      <div className="mb-5 md:mb-6">
        <h1 className="text-xl md:text-2xl font-bold text-slate-800">才藝課管理系統</h1>
        <p className="text-slate-500 text-sm mt-1">{dateDisplay}</p>
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

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4 mb-6">
        {[
          { label: "今日課程", value: loading ? null : todayCourses.length, color: "text-blue-600" },
          { label: `${month}月出課次數`, value: loading ? null : stats.monthAttendance, color: "text-green-600" },
          { label: "開課中課程", value: loading ? null : stats.courses, color: "text-purple-600" },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 md:p-5 text-center">
            {s.value === null
              ? <div className="h-9 bg-slate-100 rounded-lg animate-pulse mx-auto w-12 mb-1" />
              : <div className={`text-3xl font-bold ${s.color}`}>{s.value}</div>}
            <div className="text-sm text-slate-500 mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      {!loading && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 md:p-5 mb-6">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between mb-4">
            <div>
              <h2 className="font-semibold text-slate-800">今日待處理中心</h2>
              <p className="text-sm text-slate-500">客服每天先確認這裡，避免漏追課程與通知。</p>
            </div>
            <Link href="/notify" className="text-sm text-blue-600 hover:underline">LINE 通知</Link>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 md:gap-3">
            <div className="rounded-lg bg-blue-50 px-3 md:px-4 py-3"><div className="text-xs text-blue-500">今日課程</div><div className="text-2xl font-bold text-blue-700">{todayCourses.length}</div></div>
            <div className="rounded-lg bg-orange-50 px-3 md:px-4 py-3"><div className="text-xs text-orange-500">今日代課</div><div className="text-2xl font-bold text-orange-700">{todaySubstitutes.length}</div></div>
            <div className="rounded-lg bg-amber-50 px-3 md:px-4 py-3"><div className="text-xs text-amber-500">待回報</div><div className="text-2xl font-bold text-amber-700">{pendingReports.length}</div></div>
            <div className="rounded-lg bg-slate-50 px-3 md:px-4 py-3"><div className="text-xs text-slate-500">LINE 未綁定</div><div className="text-2xl font-bold text-slate-700">{unboundTeachers.length}</div></div>
            <div className="rounded-lg bg-rose-50 px-3 md:px-4 py-3"><div className="text-xs text-rose-500">未通知事項</div><div className="text-2xl font-bold text-rose-700">{unnotified.length}</div></div>
          </div>
        </div>
      )}

      {/* Today courses */}
      {!loading && todaySubstitutes.length > 0 && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-5 mb-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="font-semibold text-orange-900">今日代課提醒</h2>
              <p className="text-sm text-orange-700 mt-1">今天有 {todaySubstitutes.length} 筆代課，請客服確認老師與園所通知狀態。</p>
            </div>
            <div className="flex gap-2">
              <Link href="/substitutes" className="rounded-lg bg-orange-600 px-3 py-2 text-sm font-medium text-white hover:bg-orange-700">前往代課紀錄</Link>
              <Link href="/attendance" className="rounded-lg bg-white border border-orange-200 px-3 py-2 text-sm font-medium text-orange-700 hover:bg-orange-100">前往出勤紀錄</Link>
            </div>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {todaySubstitutes.map((a) => (
              <div key={a.id} className="rounded-lg bg-white border border-orange-100 px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-medium text-slate-900">{a.course.school}</div>
                    <div className="mt-1 text-sm text-slate-600">{courseLabel(a.course.courseType)}{a.course.time ? ` · ${a.course.time}` : ""}</div>
                  </div>
                  <span className="shrink-0 rounded-full bg-orange-100 px-2 py-1 text-xs font-medium text-orange-700">代課</span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                  <div><span className="text-slate-400">原老師：</span><span className="font-medium text-slate-700">{a.course.teacher.name}</span></div>
                  <div><span className="text-slate-400">代課：</span><span className="font-medium text-orange-700">{a.actualTeacher.name}</span></div>
                </div>
                {a.course.address && <div className="mt-2 text-xs text-slate-500">{a.course.address}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && pendingReports.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 mb-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="font-semibold text-amber-900">待回報課程</h2>
              <p className="text-sm text-amber-700 mt-1">已到上課時間但還缺出席人數或課程進度。</p>
            </div>
            <Link href="/attendance" className="rounded-lg bg-white border border-amber-200 px-3 py-2 text-sm font-medium text-amber-700 hover:bg-amber-100">前往出勤紀錄</Link>
          </div>
          <div className="mt-4 divide-y divide-amber-100 rounded-lg bg-white border border-amber-100">
            {pendingReports.map((a) => (
              <div key={a.id} className="p-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="font-medium text-slate-900">{a.course.school}｜{courseLabel(a.course.courseType)}</div>
                  <div className="mt-1 text-sm text-slate-500">{a.date.slice(0, 10)} · {a.actualTeacher.name}{a.course.time ? ` · ${a.course.time}` : ""}</div>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {a.studentCount == null && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">缺出席人數</span>}
                    {!(a.reportContent ?? "").trim() && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">缺課程進度</span>}
                  </div>
                </div>
                <button onClick={() => sendReportReminder(a.id)} disabled={sendingReport === a.id} className="self-start md:self-auto rounded-lg bg-amber-600 px-3 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50">
                  {sendingReport === a.id ? "發送中..." : "發送 LINE 提醒"}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && unboundTeachers.length > 0 && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-6">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-slate-800">LINE 未綁定老師</h3>
            <Link href="/notify" className="text-sm text-blue-600 hover:underline">前往綁定</Link>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {unboundTeachers.map((t) => <span key={t.id} className="rounded-full bg-white border border-slate-200 px-3 py-1 text-sm text-slate-600">{t.name}</span>)}
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mb-6">
        <div className="px-4 md:px-5 py-4 border-b border-slate-100 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="font-semibold text-slate-700">今日課程 — {todayDayName}</h2>
          <Link href="/attendance" className="text-sm text-blue-600 hover:underline">去登記出勤</Link>
        </div>
        {loading ? (
          <div className="divide-y divide-slate-100">
            {[1, 2, 3].map((i) => (
              <div key={i} className="px-4 md:px-5 py-4 flex items-center gap-4 animate-pulse">
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-slate-100 rounded w-2/3" />
                  <div className="h-3 bg-slate-100 rounded w-1/2" />
                </div>
                <div className="h-6 w-14 bg-slate-100 rounded-full" />
              </div>
            ))}
          </div>
        ) : todayCourses.length === 0 ? (
          <div className="py-12 text-center text-slate-400">今天沒有課程</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {todayCourses.map((c) => {
              const att = getAttendanceForCourse(c.id);
              return (
                <div key={c.id} className="px-4 md:px-5 py-4 flex flex-col gap-3 md:flex-row md:items-center md:gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-slate-800">{c.school}</span>
                      <span className="text-xs text-slate-400 font-mono">{c.code}</span>
                      {c.region && <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">{c.region}</span>}
                    </div>
                    <div className="text-sm text-slate-500 mt-0.5">{courseLabel(c.courseType)} · {c.teacher.name}{c.time ? ` · ${c.time}` : ""}</div>
                  </div>
                  <div className="md:text-right shrink-0">
                    {att ? (
                      att.cancelled ? (
                        <span className="text-xs bg-red-100 text-red-600 px-2 py-1 rounded-full">停課</span>
                      ) : (
                        <div className="flex flex-col items-start md:items-end gap-1">
                          <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">已登記</span>
                          {att.studentCount != null
                            ? <span className="text-sm font-bold text-blue-600">👦 {att.studentCount} 人</span>
                            : <span className="text-xs text-amber-500">待回報人數</span>}
                          {att.actualTeacher.id !== c.teacherId && <div className="text-xs text-orange-500">代：{att.actualTeacher.name}</div>}
                        </div>
                      )
                    ) : (
                      <span className="text-xs bg-slate-100 text-slate-400 px-2 py-1 rounded-full">未登記</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Today student count summary */}
      {!loading && todayAttendance.filter((a) => !a.cancelled && a.studentCount != null).length > 0 && (
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 mb-6">
          <h3 className="font-semibold text-blue-800 mb-3">📊 今日出席人數回報</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
            {todayAttendance.filter((a) => !a.cancelled && a.studentCount != null).map((a) => (
              <div key={a.id} className="bg-white rounded-lg px-3 py-2 flex items-center justify-between">
                <span className="text-sm text-slate-700 truncate">{a.course.school}</span>
                <span className="text-sm font-bold text-blue-600 ml-2 shrink-0">{a.studentCount} 人</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-blue-500 mt-2">
            共 {todayAttendance.filter((a) => !a.cancelled && a.studentCount != null).reduce((s, a) => s + (a.studentCount ?? 0), 0)} 人出席
          </p>
        </div>
      )}

      {/* Quick links */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { href: "/schedule", label: "週課表", desc: "查看每週排班" },
          { href: "/attendance", label: "登記出勤", desc: "記錄今日上課" },
          { href: "/salary", label: "薪資計算", desc: `${month}月薪資報表` },
          { href: "/schools", label: "園所管理", desc: "新增/編輯園所" },
        ].map((item) => (
          <Link key={item.href} href={item.href} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 hover:border-blue-300 hover:shadow-md transition-all">
            <div className="font-semibold text-slate-700 text-sm">{item.label}</div>
            <div className="text-xs text-slate-400 mt-1">{item.desc}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
