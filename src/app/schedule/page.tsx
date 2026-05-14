"use client";
import { useEffect, useState } from "react";
import { useDepartment } from "@/lib/departmentContext";
import { CATEGORY_BADGE_CLASS, CATEGORY_OPTIONS, courseLabel, normalizeCategory, normalizeRegion, REGION_OPTIONS } from "@/lib/courseMeta";

type Teacher = { id: number; name: string };
type Course = {
  id: number; courseId?: number; code: string; school: string; courseType: string; teacher: Teacher; teacherId: number;
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

export default function SchedulePage() {
  const { dept } = useDepartment();
  const [courses, setCourses] = useState<Course[]>([]);
  const [filterRegion, setFilterRegion] = useState("");
  const [weekStart, setWeekStart] = useState(startOfWeek());
  const [loading, setLoading] = useState(true);
  const weekEnd = addDays(weekStart, 6);
  const weekDates = DAYS.map((_, i) => addDays(weekStart, i));
  const todayIso = toIsoDate(new Date());

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filterRegion) params.set("region", filterRegion);
    if (dept) params.set("dept", dept);
    params.set("from", weekStart);
    params.set("to", weekEnd);
    const qs = params.toString();
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

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-800">週課表</h1>
          <p className="text-sm text-slate-500">
            共 {totalCourses} 筆{hasActualDates ? "實際上課日期" : "固定週排班"}
          </p>
        </div>
      </div>

      <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-sm font-semibold text-slate-800">查看週次</div>
            <div className="text-sm text-slate-500">{formatSlash(weekStart)} ~ {formatSlash(weekEnd)}</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setWeekStart(addDays(weekStart, -7))} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">上一週</button>
            <button onClick={() => setWeekStart(startOfWeek())} className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100">本週</button>
            <button onClick={() => setWeekStart(addDays(weekStart, 7))} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">下一週</button>
            <input type="date" value={weekStart} onChange={(e) => e.target.value && setWeekStart(startOfWeek(new Date(`${e.target.value}T00:00:00`)))} className="w-auto min-w-[150px]" />
          </div>
        </div>
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        <button onClick={() => setFilterRegion("")} className={`px-3 py-1 rounded-full text-sm border transition-colors ${!filterRegion ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 hover:bg-gray-50"}`}>全部地區</button>
        {[...new Set([...REGION_OPTIONS, ...allRegions])].map((r) => (
          <button key={r} onClick={() => setFilterRegion(r)} className={`px-3 py-1 rounded-full text-sm border transition-colors ${filterRegion === r ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 hover:bg-gray-50"}`}>{r}</button>
        ))}
      </div>

      {loading ? (
        <div className="py-20 text-center text-slate-400">載入中...</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm bg-white">
          <table className="w-full text-sm border-collapse" style={{ minWidth: "900px" }}>
            <thead>
              <tr className="bg-slate-50">
                <th className="text-left px-4 py-3 font-semibold text-slate-600 border-b border-r border-slate-200 w-36 sticky left-0 bg-slate-50">園所</th>
                {DAYS.map((d, i) => (
                  <th key={d} className={`min-w-[180px] px-3 py-3 font-semibold text-slate-600 border-b border-r border-slate-200 text-center ${weekDates[i] === todayIso ? "bg-blue-50 text-blue-700" : ""}`}>
                    <div>{d}</div>
                    <div className="text-xs font-normal text-slate-500">{formatShort(weekDates[i])}</div>
                    <div className="text-xs font-normal text-slate-400">{dayCounts[i]} 堂</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {schools.map((school) => {
                const schoolCourses = DAYS.map((d, i) => getCourses(school, d, weekDates[i]));
                const hasAny = schoolCourses.some((arr) => arr.length > 0);
                if (!hasAny) return null;

                const firstCourse = courses.find((c) => c.school === school);
                const region = normalizeRegion(firstCourse?.region ?? "");

                return (
                  <tr key={school} className="hover:bg-slate-50/50">
                    <td className="px-4 py-3 border-r border-slate-200 sticky left-0 bg-white hover:bg-slate-50/50">
                      <div className="font-medium text-slate-800">{school}</div>
                      {region && <div className="text-xs text-slate-400">{region}</div>}
                    </td>
                    {DAYS.map((d, i) => {
                      const cells = getCourses(school, d, weekDates[i]);
                      return (
                        <td key={d} className={`px-2 py-2 border-r border-slate-200 align-top ${weekDates[i] === todayIso ? "bg-blue-50/40" : ""}`}>
                          <div className="space-y-2">
                            {cells.map((c) => (
                              <div key={c.id} className={`rounded-lg px-3 py-2 text-xs leading-5 ${CATEGORY_BADGE_CLASS[normalizeCategory(c.category)]}`}>
                                <div className="text-[11px] font-semibold opacity-75">{c.dateLabel || formatShort(weekDates[i])} {d.replace("星期", "週")}</div>
                                <div className="font-semibold">{courseLabel(c.courseType)}</div>
                                {courseLabel(c.courseType) !== c.courseType && <div className="text-[10px] opacity-60">{c.courseType}</div>}
                                <div className="text-[11px] opacity-75">{c.school}</div>
                                <div className="text-[11px] opacity-75">{c.teacher.name}</div>
                                {c.time && <div className="text-[11px] opacity-80 whitespace-nowrap">{c.time}</div>}
                                {c.address && <div className="text-[11px] opacity-60 break-words">{c.address}</div>}
                                {c.enrollCount && <div className="text-[11px] opacity-60">{c.enrollCount}</div>}
                              </div>
                            ))}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              {schools.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center py-16 text-slate-400">尚無課程資料</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Legend */}
      <div className="flex gap-3 mt-4 flex-wrap">
        {CATEGORY_OPTIONS.map((cat) => (
          <span key={cat} className={`text-xs px-2 py-1 rounded-full ${CATEGORY_BADGE_CLASS[cat]}`}>{cat}</span>
        ))}
        <span className="text-xs text-slate-400">藍色欄位為今天</span>
      </div>
    </div>
  );
}
