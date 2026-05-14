"use client";
import { useEffect, useState } from "react";
import { useDepartment } from "@/lib/departmentContext";

type Teacher = { id: number; name: string };
type Course = {
  id: number; courseId?: number; code: string; school: string; courseType: string; teacher: Teacher; teacherId: number;
  category: string; dayOfWeek: string; date: string; dateLabel: string; time: string; region: string; enrollCount: string; address: string;
};

const DAYS = ["星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
const TODAY_IDX = new Date().getDay() - 1; // 0=Mon, -1=Sun

const catColor: Record<string, string> = {
  課後: "bg-blue-100 text-blue-800 border-blue-200",
  課內: "bg-green-100 text-green-800 border-green-200",
  Demo: "bg-orange-100 text-orange-800 border-orange-200",
  試上: "bg-purple-100 text-purple-800 border-purple-200",
};

export default function SchedulePage() {
  const { dept } = useDepartment();
  const [courses, setCourses] = useState<Course[]>([]);
  const [filterRegion, setFilterRegion] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams();
    if (filterRegion) params.set("region", filterRegion);
    if (dept) params.set("dept", dept);
    const qs = params.toString();
    fetch("/api/schedule" + (qs ? `?${qs}` : ""))
      .then((r) => r.json())
      .then((data) => { setCourses(data); setLoading(false); });
  }, [filterRegion, dept]);

  const allRegions = [...new Set(courses.map((c) => c.region).filter(Boolean))].sort();

  // Group by school
  const schools = [...new Set(courses.map((c) => c.school))].sort();

  // courses by school+day
  function getCourses(school: string, day: string) {
    return courses.filter((c) => c.school === school && c.dayOfWeek === day);
  }

  // Summary counts
  const dayCounts = DAYS.map((d) => courses.filter((c) => c.dayOfWeek === d).length);
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

      {/* Region filter */}
      <div className="flex gap-2 mb-4 flex-wrap">
        <button onClick={() => setFilterRegion("")} className={`px-3 py-1 rounded-full text-sm border transition-colors ${!filterRegion ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 hover:bg-gray-50"}`}>全部地區</button>
        {allRegions.map((r) => (
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
                  <th key={d} className={`px-3 py-3 font-semibold text-slate-600 border-b border-r border-slate-200 text-center ${i === TODAY_IDX ? "bg-blue-50 text-blue-700" : ""}`}>
                    <div>{d}</div>
                    <div className="text-xs font-normal text-slate-400">{dayCounts[i]} 堂</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {schools.map((school) => {
                const schoolCourses = DAYS.map((d) => getCourses(school, d));
                const hasAny = schoolCourses.some((arr) => arr.length > 0);
                if (!hasAny) return null;

                const firstCourse = courses.find((c) => c.school === school);
                const region = firstCourse?.region ?? "";

                return (
                  <tr key={school} className="hover:bg-slate-50/50">
                    <td className="px-4 py-3 border-r border-slate-200 sticky left-0 bg-white hover:bg-slate-50/50">
                      <div className="font-medium text-slate-800">{school}</div>
                      {region && <div className="text-xs text-slate-400">{region}</div>}
                    </td>
                    {DAYS.map((d, i) => {
                      const cells = getCourses(school, d);
                      return (
                        <td key={d} className={`px-2 py-2 border-r border-slate-200 align-top ${i === TODAY_IDX ? "bg-blue-50/40" : ""}`}>
                          <div className="space-y-1">
                            {cells.map((c) => (
                              <div key={c.id} className={`rounded-lg border px-2 py-1.5 text-xs ${catColor[c.category] ?? "bg-slate-100 text-slate-700 border-slate-200"}`}>
                                <div className="font-semibold">{c.courseType}</div>
                                {c.dateLabel && <div className="text-[11px] opacity-75">{c.dateLabel} {c.dayOfWeek.replace("星期", "週")}</div>}
                                <div className="text-[11px] opacity-75">{c.teacher.name}</div>
                                {c.time && <div className="text-[11px] opacity-60">{c.time}</div>}
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
        {Object.entries(catColor).map(([cat, cls]) => (
          <span key={cat} className={`text-xs px-2 py-1 rounded-full border ${cls}`}>{cat}</span>
        ))}
        {TODAY_IDX >= 0 && TODAY_IDX < 6 && <span className="text-xs text-slate-400">藍色欄位為今天（{DAYS[TODAY_IDX]}）</span>}
      </div>
    </div>
  );
}
