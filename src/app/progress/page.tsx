"use client";
import { useEffect, useState } from "react";
import { useDepartment, DEPARTMENTS } from "@/lib/departmentContext";
import { courseLabel } from "@/lib/courseMeta";

type Teacher = { id: number; name: string };
type CourseInfo = { id: number; school: string; courseType: string; department: string };
type ProgressRecord = {
  id: number; date: string; course: CourseInfo; actualTeacher: Teacher;
  studentCount: number | null; cancelled: boolean; reportContent: string; reportSentAt: string | null;
};

export default function ProgressPage() {
  const { dept, setDept } = useDepartment();
  const [records, setRecords] = useState<ProgressRecord[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [schools, setSchools] = useState<string[]>([]);
  const [filterYear, setFilterYear] = useState(new Date().getFullYear());
  const [filterMonth, setFilterMonth] = useState(new Date().getMonth() + 1);
  const [filterTeacher, setFilterTeacher] = useState("");
  const [filterSchool, setFilterSchool] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/teachers").then((r) => r.json()).then(setTeachers);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await Promise.resolve();
      setLoading(true);
      const params = new URLSearchParams({ year: String(filterYear), month: String(filterMonth) });
      if (dept) params.set("dept", dept);
      if (filterTeacher) params.set("teacherId", filterTeacher);
      if (filterSchool) params.set("school", filterSchool);
      const r = await fetch(`/api/progress?${params}`);
      const data: ProgressRecord[] = await r.json();
      if (cancelled) return;
      setRecords(data);
      const schoolSet = [...new Set(data.map((rec) => rec.course.school))].sort();
      setSchools(schoolSet);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [filterYear, filterMonth, dept, filterTeacher, filterSchool]);

  const months = Array.from({ length: 12 }, (_, i) => i + 1);
  const years = [2024, 2025, 2026];

  const grouped = records.reduce<Record<string, ProgressRecord[]>>((acc, r) => {
    const key = r.course.school;
    if (!acc[key]) acc[key] = [];
    acc[key].push(r);
    return acc;
  }, {});

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-800">課程進度記錄</h1>
          <p className="text-sm text-slate-500">老師 LINE 回傳的課程進度內容</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 mb-6">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex items-center gap-2">
            <label className="text-sm text-slate-600 whitespace-nowrap">部門</label>
            <select value={dept} onChange={(e) => setDept(e.target.value as never)}
              className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm">
              <option value="">全部</option>
              {DEPARTMENTS.map((d) => <option key={d}>{d}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-slate-600">年份</label>
            <select value={filterYear} onChange={(e) => setFilterYear(Number(e.target.value))}
              className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm">
              {years.map((y) => <option key={y}>{y}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-slate-600">月份</label>
            <select value={filterMonth} onChange={(e) => setFilterMonth(Number(e.target.value))}
              className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm">
              {months.map((m) => <option key={m} value={m}>{m}月</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-slate-600">老師</label>
            <select value={filterTeacher} onChange={(e) => setFilterTeacher(e.target.value)}
              className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm">
              <option value="">全部</option>
              {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          {schools.length > 0 && (
            <div className="flex items-center gap-2">
              <label className="text-sm text-slate-600">園所</label>
              <select value={filterSchool} onChange={(e) => setFilterSchool(e.target.value)}
                className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm">
                <option value="">全部</option>
                {schools.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
          )}
          <span className="text-sm text-slate-400 ml-auto">共 {records.length} 筆</span>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-slate-400">載入中...</div>
      ) : records.length === 0 ? (
        <div className="text-center py-12 text-slate-400">
          <p className="text-lg mb-2">尚無進度記錄</p>
          <p className="text-sm">老師透過 LINE 回報課程進度後，內容會顯示在這裡</p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([school, recs]) => (
            <div key={school} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="bg-slate-50 border-b border-slate-100 px-4 py-3 flex items-center justify-between">
                <h2 className="font-semibold text-slate-800">{school}</h2>
                <span className="text-xs text-slate-400">{recs.length} 筆記錄</span>
              </div>
              <div className="divide-y divide-slate-100">
                {recs.map((r) => (
                  <div key={r.id} className="px-4 py-4">
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-3 mb-2 flex-wrap">
                          <span className="text-sm font-medium text-slate-700">
                            {new Date(r.date).toLocaleDateString("zh-TW", { month: "long", day: "numeric", weekday: "short" })}
                          </span>
                          <span className="text-xs text-slate-500">{courseLabel(r.course.courseType)}</span>
                          <span className="text-xs text-slate-500">👨‍🏫 {r.actualTeacher.name}</span>
                          {r.studentCount !== null && (
                            <span className="text-xs text-slate-500">👦 {r.studentCount}人</span>
                          )}
                          {r.cancelled && (
                            <span className="px-1.5 py-0.5 bg-red-100 text-red-600 rounded text-xs">取消</span>
                          )}
                          {r.reportSentAt && (
                            <span className="px-1.5 py-0.5 bg-green-100 text-green-600 rounded text-xs">已發送</span>
                          )}
                        </div>
                        <p className="text-sm text-slate-700 whitespace-pre-wrap bg-slate-50 rounded-lg px-3 py-2">
                          {r.reportContent}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
