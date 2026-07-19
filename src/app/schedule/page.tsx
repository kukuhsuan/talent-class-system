"use client";
import { useEffect, useState } from "react";
import { useDepartment } from "@/lib/departmentContext";
import { CATEGORY_BADGE_CLASS, CATEGORY_OPTIONS, courseLabel, normalizeCategory, normalizeRegion, REGION_OPTIONS } from "@/lib/courseMeta";

type Teacher = { id: number; name: string };
type Course = {
  id: number; courseId?: number; code: string; school: string; courseType: string; teacher: Teacher; teacherId: number;
  originalTeacher?: Teacher | null; isSubstitute?: boolean;
  assistantTeacher?: Teacher | null; assistantTeacherId?: number | null;
  originalAssistantTeacher?: Teacher | null; isAssistantSubstitute?: boolean;
  category: string; dayOfWeek: string; date: string; dateLabel: string; time: string; region: string; enrollCount: string; address: string;
};

const DAYS = ["星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
const MS_PER_DAY = 86400000;

function toIsoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function startOfWeek(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return toIsoDate(d);
}

function addDays(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return toIsoDate(d);
}

function formatSlash(iso: string) {
  const d = new Date(`${iso}T00:00:00.000Z`);
  return `${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${String(d.getUTCDate()).padStart(2, "0")}`;
}

function formatShort(iso: string) {
  const d = new Date(`${iso}T00:00:00.000Z`);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}

function weekdayLabel(iso: string) {
  const labels = ["週日", "週一", "週二", "週三", "週四", "週五", "週六"];
  return labels[new Date(`${iso}T00:00:00.000Z`).getUTCDay()];
}

function formatEnrollCount(count?: string) {
  if (!count) return "";
  return count.endsWith("人") ? count : `${count}人`;
}

export default function SchedulePage() {
  const { dept } = useDepartment();
  const [courses, setCourses] = useState<Course[]>([]);
  const [filterRegion, setFilterRegion] = useState("");
  const [weekStart, setWeekStart] = useState(startOfWeek());
  const [loading, setLoading] = useState(true);
  const weekEnd = addDays(weekStart, 6);
  const weekDates = DAYS.map((_, i) => addDays(weekStart, i));
  const todayIso = toIsoDate(new Date());
  const isAfterSchool = dept === "安親班";
  const schoolColumnLabel = dept === "國小" ? "學校" : dept === "" ? "園所／學校" : "園所";
  const scheduleTitle = isAfterSchool ? "安親班日期課表" : `${dept || "全系統"}日期課表`;

  useEffect(() => {
    const params = new URLSearchParams();
    if (filterRegion) params.set("region", filterRegion);
    if (dept) params.set("dept", dept);
    params.set("from", weekStart);
    params.set("to", weekEnd);
    const qs = params.toString();
    void Promise.resolve().then(() => setLoading(true));
    fetch("/api/schedule" + (qs ? `?${qs}` : ""))
      .then((r) => r.json())
      .then((data) => { setCourses(data); setLoading(false); });
  }, [filterRegion, dept, weekStart, weekEnd]);

  const allRegions = [...new Set(courses.map((c) => normalizeRegion(c.region)).filter(Boolean))].sort();

  // Group by school
  const schools = [...new Set(courses.map((c) => c.school))].sort();

  // courses by school+day
  function getCourses(school: string, day: string, date: string) {
    return courses.filter((c) => c.school === school && c.dayOfWeek === day && (!c.date || c.date === date));
  }

  // Summary counts
  const dayCounts = DAYS.map((d, i) => courses.filter((c) => c.dayOfWeek === d && (!c.date || c.date === weekDates[i])).length);
  const totalCourses = courses.length;
  const hasActualDates = courses.some((c) => c.date);
  const mobileDayGroups = DAYS.map((day, i) => ({
    day,
    date: weekDates[i],
    courses: courses
      .filter((c) => c.dayOfWeek === day && (!c.date || c.date === weekDates[i]))
      .sort((a, b) => (a.time || "").localeCompare(b.time || "")),
  }));
  const dateGroups = Object.entries(courses.reduce<Record<string, Course[]>>((acc, course) => {
    const date = course.date || "";
    if (!date) return acc;
    if (!acc[date]) acc[date] = [];
    acc[date].push(course);
    return acc;
  }, {}))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, items]) => ({
      date,
      courses: items.sort((a, b) => (a.time || "").localeCompare(b.time || "") || a.school.localeCompare(b.school, "zh-Hant")),
    }));

  return (
    <div>
      <div className="flex items-center justify-between mb-5 md:mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-800">{scheduleTitle}</h1>
          <p className="text-sm text-slate-500">
            共 {totalCourses} 筆課程，依日期與時間排列
          </p>
        </div>
      </div>

      <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-sm font-semibold text-slate-800">查看日期區間</div>
            <div className="text-sm text-slate-500">{formatSlash(weekStart)} ~ {formatSlash(weekEnd)}</div>
          </div>
          <div className="grid grid-cols-3 gap-2 md:flex md:flex-wrap">
            <button onClick={() => setWeekStart(addDays(weekStart, -7))} className="rounded-lg border border-slate-200 bg-white px-3 py-3 md:py-2 text-sm text-slate-700 hover:bg-slate-50">上一週</button>
            <button onClick={() => setWeekStart(startOfWeek())} className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-3 md:py-2 text-sm font-medium text-blue-700 hover:bg-blue-100">本週</button>
            <button onClick={() => setWeekStart(addDays(weekStart, 7))} className="rounded-lg border border-slate-200 bg-white px-3 py-3 md:py-2 text-sm text-slate-700 hover:bg-slate-50">下一週</button>
            <input type="date" value={weekStart} onChange={(e) => e.target.value && setWeekStart(startOfWeek(new Date(`${e.target.value}T00:00:00`)))} className="col-span-3 w-full md:w-auto md:min-w-[150px]" />
          </div>
        </div>
      </div>

      {/* 縣市改下拉選單，避免整排按鈕佔版面 */}
      <div className="mb-4 flex items-center gap-2">
        <label className="text-sm font-semibold text-slate-700">地區</label>
        <select value={filterRegion} onChange={(e) => setFilterRegion(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
          <option value="">全部地區</option>
          {[...new Set([...REGION_OPTIONS, ...allRegions])].map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        {filterRegion && <button onClick={() => setFilterRegion("")} className="text-sm text-blue-600 hover:underline">清除</button>}
      </div>

      {loading ? (
        <div className="py-20 text-center text-slate-400">載入中...</div>
      ) : (
        <div className="space-y-4">
          {dateGroups.map((group) => (
            <section key={group.date} className={`overflow-hidden rounded-xl border bg-white shadow-sm ${group.date === todayIso ? "border-blue-300 ring-2 ring-blue-50" : "border-slate-200"}`}>
              <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-3">
                <div className="flex items-baseline gap-2">
                  <h2 className="font-bold text-slate-900">{group.date}</h2>
                  <span className="text-sm font-medium text-slate-500">{weekdayLabel(group.date)}</span>
                </div>
                <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">{group.courses.length} 堂</span>
              </div>
              <div className="hidden min-w-[1040px] grid-cols-[150px_minmax(260px,1fr)_180px_280px_84px_72px] items-center gap-x-6 border-b border-slate-100 bg-white px-4 py-2 text-xs font-semibold text-slate-400 md:grid">
                <div>時間</div>
                <div>{schoolColumnLabel} / 地區</div>
                <div>課程 / 編號</div>
                <div>老師</div>
                <div className="text-right">類別</div>
                <div className="text-right">預計人數</div>
              </div>
              <div className="divide-y divide-slate-100 overflow-x-auto">
                {group.courses.map((course) => (
                  <div key={`${course.id}-${course.date}`} className="grid gap-3 px-4 py-4 md:min-w-[1040px] md:grid-cols-[150px_minmax(260px,1fr)_180px_280px_84px_72px] md:items-center md:gap-x-6">
                    <div className="flex items-center justify-between gap-3 md:block">
                      <div className="shrink-0 text-base font-bold text-blue-700">{course.time || "時間待確認"}</div>
                      <div className="flex shrink-0 items-center gap-2 md:hidden">
                        <span className={`rounded-full px-2 py-1 text-xs font-medium ${CATEGORY_BADGE_CLASS[normalizeCategory(course.category)]}`}>{normalizeCategory(course.category)}</span>
                        {course.enrollCount && <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600">{formatEnrollCount(course.enrollCount)}</span>}
                      </div>
                    </div>
                    <div className="min-w-0">
                      <div className="truncate font-semibold text-slate-900" title={course.school}>{course.school}</div>
                      <div className="mt-1 text-xs text-slate-500">{normalizeRegion(course.region) || "未填地區"}</div>
                    </div>
                    <div className="min-w-0">
                      <div className="truncate font-semibold text-slate-800" title={courseLabel(course.courseType)}>{courseLabel(course.courseType)}</div>
                      {course.code && <div className="mt-1 text-xs text-slate-400">{course.code}</div>}
                    </div>
                    <div className="min-w-0 text-sm text-slate-600">
                      <div className="flex flex-wrap items-center gap-1">
                        <span>主教：{course.teacher.name}</span>
                        {course.isSubstitute && <span className="rounded-full bg-orange-50 px-1.5 py-0.5 text-[11px] font-bold text-orange-600">代</span>}
                      </div>
                      {course.isSubstitute && course.originalTeacher && (
                        <div className="mt-1 text-xs text-orange-600">原老師：{course.originalTeacher.name}</div>
                      )}
                      {course.assistantTeacher && (
                        <div className="mt-1 flex flex-wrap items-center gap-1 text-blue-600">
                          <span>助教：{course.assistantTeacher.name}</span>
                          {course.isAssistantSubstitute && <span className="rounded-full bg-orange-50 px-1.5 py-0.5 text-[11px] font-bold text-orange-600">代</span>}
                        </div>
                      )}
                      {course.isAssistantSubstitute && course.originalAssistantTeacher && (
                        <div className="mt-1 text-xs text-orange-600">原助教：{course.originalAssistantTeacher.name}</div>
                      )}
                    </div>
                    <div className="hidden md:flex md:justify-end">
                      <span className={`rounded-full px-2 py-1 text-xs font-medium ${CATEGORY_BADGE_CLASS[normalizeCategory(course.category)]}`}>{normalizeCategory(course.category)}</span>
                    </div>
                    <div className="hidden md:flex md:justify-end">
                      {course.enrollCount ? (
                        <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600">{formatEnrollCount(course.enrollCount)}</span>
                      ) : (
                        <span className="text-xs text-slate-400">未設定</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
          {dateGroups.length === 0 && (
            <div className="rounded-xl border border-slate-200 bg-white py-16 text-center text-slate-400">此日期區間尚無課程</div>
          )}
        </div>
      )}

      {/* Legend */}
      <div className="flex gap-3 mt-4 flex-wrap">
        {CATEGORY_OPTIONS.map((cat) => (
          <span key={cat} className={`text-xs px-2 py-1 rounded-full ${CATEGORY_BADGE_CLASS[cat]}`}>{cat}</span>
        ))}
        <span className="text-xs text-slate-400">藍色框為今天；橘色「代」代表代課</span>
      </div>
    </div>
  );
}
