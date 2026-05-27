"use client";
import { useCallback, useEffect, useState } from "react";
import { COURSE_OPTIONS, courseLabel, DEPARTMENT_OPTIONS } from "@/lib/courseMeta";

type School = { id: number; name: string; type: string };
type CourseGroup = { courseType: string; courseName: string; lessons: number; people: number; teachers: string[] };
type SchoolGroup = { school: string; schoolType: string; totalLessons: number; totalPeople: number; courses: CourseGroup[] };
type DetailRow = { id: number; date: string; studentCount: number; teacherName: string };

export default function SchoolStatsPage() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [type, setType] = useState("");
  const [school, setSchool] = useState("");
  const [courseType, setCourseType] = useState("");
  const [schools, setSchools] = useState<School[]>([]);
  const [data, setData] = useState<{ total: number; totalLessons: number; groups: SchoolGroup[] }>({ total: 0, totalLessons: 0, groups: [] });
  const [loading, setLoading] = useState(false);
  const [expandedSchools, setExpandedSchools] = useState<Record<string, boolean>>({});
  const [expandedCourses, setExpandedCourses] = useState<Record<string, boolean>>({});
  const [courseDetails, setCourseDetails] = useState<Record<string, DetailRow[]>>({});
  const [loadingDetails, setLoadingDetails] = useState<Record<string, boolean>>({});

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
    setExpandedSchools({});
    setExpandedCourses({});
    setCourseDetails({});
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

  const schoolGroups = data.groups;

  function toggleSchool(name: string) {
    setExpandedSchools((current) => ({ ...current, [name]: !current[name] }));
  }

  function detailKey(schoolName: string, course: CourseGroup) {
    return `${schoolName}::${course.courseType || course.courseName}`;
  }

  async function toggleCourse(schoolName: string, course: CourseGroup) {
    const key = detailKey(schoolName, course);
    const nextOpen = !expandedCourses[key];
    setExpandedCourses((current) => ({ ...current, [key]: nextOpen }));
    if (!nextOpen || courseDetails[key] || loadingDetails[key]) return;

    setLoadingDetails((current) => ({ ...current, [key]: true }));
    const params = new URLSearchParams({ year: String(year), month: String(month), detail: "1", school: schoolName });
    if (type) params.set("type", type);
    if (course.courseType) params.set("courseType", course.courseType);
    const res = await fetch(`/api/school-attendance-stats?${params}`);
    const body = await res.json() as { rows: DetailRow[] };
    setCourseDetails((current) => ({ ...current, [key]: body.rows }));
    setLoadingDetails((current) => ({ ...current, [key]: false }));
  }

  function shortDate(value: string) {
    return value.slice(5).replace("-", "/");
  }

  return (
    <div>
      <div className="flex flex-col gap-3 mb-6 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">園所上課統計</h1>
          <p className="text-sm text-slate-500">依上課紀錄統計園所出席人數，不含老師薪資統計</p>
        </div>
        <button onClick={exportExcel} className="self-start rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 md:self-auto">匯出 Excel</button>
      </div>

      <div className="mb-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
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

      <div className="mb-6 grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-sm font-medium text-emerald-700">本月總堂數</p>
          <p className="mt-1 text-3xl font-bold text-emerald-900">{data.totalLessons.toLocaleString("zh-TW")} 堂</p>
        </div>
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
          <p className="text-sm font-medium text-blue-700">本月總人數</p>
          <p className="mt-1 text-3xl font-bold text-blue-900">{data.total.toLocaleString("zh-TW")} 人</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-sm font-medium text-slate-500">園所數</p>
          <p className="mt-1 text-3xl font-bold text-slate-900">{schoolGroups.length.toLocaleString("zh-TW")} 間</p>
        </div>
      </div>

      <div className="space-y-3">
        {schoolGroups.map((group) => {
          const opened = Boolean(expandedSchools[group.school]);
          const courses = group.courses;
          return (
            <section key={group.school} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <button type="button" onClick={() => toggleSchool(group.school)}
                className="flex w-full flex-col gap-3 px-4 py-4 text-left hover:bg-slate-50 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-bold text-slate-900">{group.school}</h2>
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-500">{group.schoolType || "未分類"}</span>
                  </div>
                  <p className="mt-1 text-sm font-semibold text-slate-600">
                    總計：{group.totalLessons.toLocaleString("zh-TW")} 堂 / {group.totalPeople.toLocaleString("zh-TW")} 人
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">{courses.length} 種課程</span>
                  <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">{group.totalPeople.toLocaleString("zh-TW")} 人</span>
                  <span className="text-sm font-medium text-slate-400">{opened ? "收合" : "展開"}</span>
                </div>
              </button>

              {opened && (
                <div className="border-t border-slate-100 px-4 py-3">
                  <div className="grid gap-2">
                    {courses.map((course) => (
                      <div key={course.courseType || course.courseName} className="rounded-lg bg-slate-50 px-3 py-3">
                        <button type="button" onClick={() => void toggleCourse(group.school, course)}
                          className="flex w-full flex-col gap-2 text-left md:flex-row md:items-center md:justify-between">
                          <div>
                            <div className="font-semibold text-slate-800">{course.courseName}</div>
                            <div className="mt-1 text-xs text-slate-500">老師：{course.teachers.join("、") || "—"}</div>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                            <span className="rounded-full bg-white px-3 py-1 text-slate-700 ring-1 ring-slate-200">{course.lessons.toLocaleString("zh-TW")} 堂</span>
                            <span className="rounded-full bg-white px-3 py-1 text-blue-700 ring-1 ring-blue-100">{course.people.toLocaleString("zh-TW")} 人</span>
                            <span className="text-xs font-medium text-slate-400">{expandedCourses[detailKey(group.school, course)] ? "收合日期" : "展開日期"}</span>
                          </div>
                        </button>
                        {expandedCourses[detailKey(group.school, course)] && (
                          <div className="mt-3 space-y-1.5 border-t border-white pt-3">
                            {loadingDetails[detailKey(group.school, course)] ? (
                              <div className="rounded-lg bg-white px-3 py-2 text-sm text-slate-400">載入日期明細中...</div>
                            ) : (
                              (courseDetails[detailKey(group.school, course)] ?? []).map((row) => (
                                <div key={row.id} className="flex items-center justify-between rounded-lg bg-white px-3 py-2 text-sm">
                                  <span className="font-medium text-slate-700">{shortDate(row.date)}</span>
                                  <span className="font-semibold text-slate-900">{row.studentCount.toLocaleString("zh-TW")} 人</span>
                                </div>
                              ))
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>
          );
        })}
        {schoolGroups.length === 0 && (
          <div className="rounded-xl border border-slate-200 bg-white py-12 text-center text-slate-400">尚無資料</div>
        )}
      </div>
    </div>
  );
}
