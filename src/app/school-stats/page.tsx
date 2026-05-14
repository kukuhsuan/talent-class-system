"use client";
import { useCallback, useEffect, useState } from "react";
import { COURSE_OPTIONS, courseLabel, DEPARTMENT_OPTIONS } from "@/lib/courseMeta";

type School = { id: number; name: string; type: string };
type Row = { id: number; school: string; schoolType: string; courseType: string; courseName: string; date: string; studentCount: number };

export default function SchoolStatsPage() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [type, setType] = useState("");
  const [school, setSchool] = useState("");
  const [courseType, setCourseType] = useState("");
  const [schools, setSchools] = useState<School[]>([]);
  const [data, setData] = useState<{ total: number; rows: Row[] }>({ total: 0, rows: [] });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/schools").then((r) => r.json()).then(setSchools);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ year: String(year), month: String(month) });
    if (type) params.set("type", type);
    if (school) params.set("school", school);
    if (courseType) params.set("courseType", courseType);
    const res = await fetch(`/api/school-attendance-stats?${params}`);
    setData(await res.json());
    setLoading(false);
  }, [year, month, type, school, courseType]);

  useEffect(() => { void load(); }, [load]);

  function exportExcel() {
    const params = new URLSearchParams({ year: String(year), month: String(month), format: "xlsx" });
    if (type) params.set("type", type);
    if (school) params.set("school", school);
    if (courseType) params.set("courseType", courseType);
    window.location.href = `/api/school-attendance-stats?${params}`;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-800">園所上課人數統計</h1>
          <p className="text-sm text-slate-500">依上課紀錄統計園所出席人數，不含老師薪資統計</p>
        </div>
        <button onClick={exportExcel} className="bg-green-600 hover:bg-green-700 text-white font-medium px-4 py-2 rounded-lg text-sm">匯出 Excel</button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 mb-6">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <div>
            <label className="text-xs text-slate-500">年份</label>
            <select value={year} onChange={(e) => setYear(Number(e.target.value))}>
              {[2024, 2025, 2026, 2027].map((y) => <option key={y}>{y}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-500">月份</label>
            <select value={month} onChange={(e) => setMonth(Number(e.target.value))}>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => <option key={m} value={m}>{m}月</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-500">園所類型</label>
            <select value={type} onChange={(e) => setType(e.target.value)}>
              <option value="">全部</option>
              {DEPARTMENT_OPTIONS.map((d) => <option key={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-500">園所</label>
            <select value={school} onChange={(e) => setSchool(e.target.value)}>
              <option value="">全部</option>
              {schools.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-500">課程</label>
            <select value={courseType} onChange={(e) => setCourseType(e.target.value)}>
              <option value="">全部</option>
              {COURSE_OPTIONS.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
            </select>
          </div>
          <div className="flex items-end">
            <button onClick={load} disabled={loading} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-2 rounded-lg text-sm disabled:opacity-50">
              {loading ? "載入中..." : "查詢"}
            </button>
          </div>
        </div>
      </div>

      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mb-6">
        <p className="text-sm text-emerald-700">本月園所上課總人數</p>
        <p className="text-3xl font-bold text-emerald-900">{data.total.toLocaleString("zh-TW")} 人</p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-4 py-3 text-left">園所名稱</th>
                <th className="px-4 py-3 text-left">園所類型</th>
                <th className="px-4 py-3 text-left">課程名稱</th>
                <th className="px-4 py-3 text-left">上課日期</th>
                <th className="px-4 py-3 text-right">出席人數</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.rows.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-800">{r.school}</td>
                  <td className="px-4 py-3">{r.schoolType}</td>
                  <td className="px-4 py-3">{r.courseName || courseLabel(r.courseType)}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{r.date}</td>
                  <td className="px-4 py-3 text-right font-semibold">{r.studentCount}</td>
                </tr>
              ))}
              {data.rows.length === 0 && <tr><td colSpan={5} className="text-center py-10 text-slate-400">尚無資料</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
