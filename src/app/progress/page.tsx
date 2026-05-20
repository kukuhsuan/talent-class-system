"use client";
import { useEffect, useRef, useState } from "react";
import { SaveButton } from "@/components/SaveButton";
import { Toast } from "@/components/Toast";
import { ensureOk } from "@/lib/clientApi";
import { useDepartment, DEPARTMENTS } from "@/lib/departmentContext";
import { COURSE_OPTIONS, courseLabel } from "@/lib/courseMeta";
import { useScrollToFormOnEdit } from "@/lib/useScrollToFormOnEdit";
import { useToast } from "@/lib/useToast";

type Teacher = { id: number; name: string };
type CourseInfo = { id: number; school: string; courseType: string; department: string };
type CourseOption = { code: string; label: string };
type ProgressRecord = {
  id: number; date: string; course: CourseInfo; actualTeacher: Teacher;
  studentCount: number | null; cancelled: boolean; reportContent: string; reportSentAt: string | null;
  skillFocus?: string; classStatus?: string; incident?: boolean; incidentChild?: string; incidentProcess?: string;
  incidentAction?: string; incidentNotified?: string; aiSummary?: string; aiSkillFocus?: string; aiTeachingNote?: string;
};
type CourseProgress = { id: number; courseType: string; lesson: number; title: string };

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
  const [manageCourse, setManageCourse] = useState("足球");
  const [courseOptions, setCourseOptions] = useState<CourseOption[]>(COURSE_OPTIONS.map((option) => ({ ...option })));
  const [progressRows, setProgressRows] = useState<CourseProgress[]>([]);
  const [progressForm, setProgressForm] = useState({ id: 0, lesson: "", title: "" });
  const [savingProgress, setSavingProgress] = useState(false);
  const { toast, showToast } = useToast();
  const formRef = useRef<HTMLDivElement | null>(null);
  const firstInputRef = useRef<HTMLInputElement | null>(null);
  const scrollToFormOnEdit = useScrollToFormOnEdit(formRef, firstInputRef);

  useEffect(() => {
    fetch("/api/teachers").then((r) => r.json()).then(setTeachers);
    fetch("/api/course-options").then((r) => r.json()).then(setCourseOptions);
  }, []);

  useEffect(() => {
    fetch(`/api/course-progress?courseType=${encodeURIComponent(manageCourse)}`)
      .then((r) => r.json())
      .then(setProgressRows);
    setProgressForm({ id: 0, lesson: "", title: "" });
  }, [manageCourse]);

  async function saveProgress() {
    const payload = { courseType: manageCourse, lesson: Number(progressForm.lesson), title: progressForm.title };
    if (!payload.lesson || !payload.title.trim()) return alert("請填寫第幾堂與課程內容");
    if (savingProgress) return;
    const url = progressForm.id ? `/api/course-progress/${progressForm.id}` : "/api/course-progress";
    setSavingProgress(true);
    try {
      const res = await fetch(url, { method: progressForm.id ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      await ensureOk(res, "課程進度儲存失敗");
      const rows = await fetch(`/api/course-progress?courseType=${encodeURIComponent(manageCourse)}`).then((r) => r.json());
      setProgressRows(rows);
      setProgressForm({ id: 0, lesson: "", title: "" });
      showToast("success", "課程進度已儲存");
    } catch (e) {
      showToast("error", (e as Error).message || "課程進度儲存失敗", 3000);
    } finally {
      setSavingProgress(false);
    }
  }

  async function deleteProgress(id: number) {
    if (!confirm("確定刪除此課程進度？")) return;
    await fetch(`/api/course-progress/${id}`, { method: "DELETE" });
    setProgressRows((rows) => rows.filter((r) => r.id !== id));
  }

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

  function parseList(value: string | undefined) {
    if (!value) return [];
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
    } catch {
      return value.split(/[、,，\n]/).map((item) => item.trim()).filter(Boolean);
    }
  }

  function primaryReportText(value: string | undefined) {
    if (!value) return "";
    const lines = value.split("\n").map((line) => line.trim()).filter(Boolean);
    return lines[0] ?? "";
  }

  return (
    <div>
      <Toast toast={toast} />
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-800">課程進度記錄</h1>
          <p className="text-sm text-slate-500">老師 LINE 回傳的課程進度內容</p>
        </div>
      </div>

      <div ref={formRef} className={`bg-white rounded-xl border shadow-sm p-4 mb-6 ${progressForm.id ? "border-blue-200 ring-2 ring-blue-50" : "border-slate-200"}`}>
        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
          <div>
            <h2 className="font-semibold text-slate-800">{progressForm.id ? "正在編輯課程進度" : "課程進度管理"}</h2>
            <p className="text-xs text-slate-500">管理老師 LINE 回報時可選擇的第幾堂課程內容</p>
          </div>
          <select value={manageCourse} onChange={(e) => setManageCourse(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm">
            {courseOptions.map((c) => <option key={c.code} value={c.label}>{c.label}</option>)}
          </select>
        </div>

        <div className="grid md:grid-cols-[120px_1fr_auto] gap-3 mb-4">
          <input ref={firstInputRef} value={progressForm.lesson} onChange={(e) => setProgressForm({ ...progressForm, lesson: e.target.value })}
            type="number" min="1" placeholder="第幾堂" className="border border-slate-200 rounded-lg px-3 py-2 text-sm" />
          <input value={progressForm.title} onChange={(e) => setProgressForm({ ...progressForm, title: e.target.value })}
            placeholder="課程內容名稱" className="border border-slate-200 rounded-lg px-3 py-2 text-sm" />
          <SaveButton saving={savingProgress} onClick={saveProgress} idleText={progressForm.id ? "更新" : "新增"} savingText="儲存中…" />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-3 py-2 text-left w-24">堂數</th>
                <th className="px-3 py-2 text-left">課程內容</th>
                <th className="px-3 py-2 text-right w-32">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {progressRows.map((row) => (
                <tr key={row.id}>
                  <td className="px-3 py-2">第 {row.lesson} 堂</td>
                  <td className="px-3 py-2">{row.title}</td>
                  <td className="px-3 py-2 text-right">
                    <button onClick={() => { setProgressForm({ id: row.id, lesson: String(row.lesson), title: row.title }); scrollToFormOnEdit(); }} className="text-blue-600 text-sm mr-3">編輯</button>
                    <button onClick={() => deleteProgress(row.id)} className="text-red-500 text-sm">刪除</button>
                  </td>
                </tr>
              ))}
              {progressRows.length === 0 && <tr><td colSpan={3} className="text-center py-6 text-slate-400">尚無課程進度，可新增第一筆</td></tr>}
            </tbody>
          </table>
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
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${r.course.department.includes("幼兒園") ? "bg-green-50 text-green-700" : "bg-slate-100 text-slate-600"}`}>
                            {r.course.department || "未分類"}
                          </span>
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
                        {primaryReportText(r.reportContent) && (
                          <p className="text-sm text-slate-700 whitespace-pre-wrap bg-slate-50 rounded-lg px-3 py-2">
                            {primaryReportText(r.reportContent)}
                          </p>
                        )}
                        {((r.course.department.includes("幼兒園") && (parseList(r.skillFocus).length > 0 || r.classStatus)) || r.incident) && (
                          <div className="mt-3 grid gap-2 text-xs md:grid-cols-3">
                            {r.course.department.includes("幼兒園") && parseList(r.skillFocus).length > 0 && (
                              <div className="rounded-lg bg-green-50 px-3 py-2 text-green-700">
                                <div className="font-semibold">今日能力培養</div>
                                <div className="mt-1">{parseList(r.skillFocus).join("、")}</div>
                              </div>
                            )}
                            {r.course.department.includes("幼兒園") && r.classStatus && (
                              <div className="rounded-lg bg-blue-50 px-3 py-2 text-blue-700">
                                <div className="font-semibold">課堂狀況</div>
                                <div className="mt-1">{r.classStatus}</div>
                              </div>
                            )}
                            {r.incident && (
                              <div className="rounded-lg bg-amber-50 px-3 py-2 text-amber-700">
                                <div className="font-semibold">特殊事件</div>
                                <div className="mt-1">{r.incidentChild || "未填姓名"}｜{r.incidentNotified === "是" ? `已通知${r.course.department.includes("幼兒園") ? "園所" : "現場老師或窗口"}` : `未通知${r.course.department.includes("幼兒園") ? "園所" : "現場老師或窗口"}`}</div>
                              </div>
                            )}
                          </div>
                        )}
                        {(r.aiSummary || r.aiSkillFocus || r.aiTeachingNote) && (
                          <div className="mt-3 rounded-lg border border-green-100 bg-[#F8FBF8] px-3 py-2 text-sm leading-6 text-slate-700">
                            <div className="mb-1 text-xs font-semibold text-green-700">AI 教學紀錄</div>
                            {r.aiSummary && <p>{r.aiSummary}</p>}
                            {r.aiSkillFocus && <p>{r.aiSkillFocus}</p>}
                            {r.aiTeachingNote && <p>{r.aiTeachingNote}</p>}
                          </div>
                        )}
                        {r.incident && (r.incidentProcess || r.incidentAction) && (
                          <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">
                            {r.incidentProcess && <div><span className="font-semibold">發生經過：</span>{r.incidentProcess}</div>}
                            {r.incidentAction && <div><span className="font-semibold">處理方式：</span>{r.incidentAction}</div>}
                          </div>
                        )}
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
