"use client";
import { useEffect, useRef, useState } from "react";
import { SaveButton } from "@/components/SaveButton";
import { Toast } from "@/components/Toast";
import { parseAbilities } from "@/lib/abilityMap";
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
  incidentAction?: string; incidentNotified?: string;
  schoolNotifyStatus?: string; schoolNotifyError?: string; schoolNotifiedAt?: string | null;
};
type LessonTemplate = {
  id: number;
  courseType: string;
  lesson: number;
  title: string;
  focus: string;
  skills: string[];
  activityDirection: string;
  aiStyle: string;
};
type PageResult<T> = { items: T[]; total: number; page: number; pageSize: number };

export default function ProgressPage() {
  const { dept, setDept } = useDepartment();
  const [records, setRecords] = useState<ProgressRecord[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [schools, setSchools] = useState<string[]>([]);
  const [filterYear, setFilterYear] = useState(new Date().getFullYear());
  const [filterMonth, setFilterMonth] = useState(new Date().getMonth() + 1);
  const [filterTeacher, setFilterTeacher] = useState("");
  const [filterSchool, setFilterSchool] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 20;
  const [loading, setLoading] = useState(true);
  const [manageCourse, setManageCourse] = useState("足球");
  const [courseOptions, setCourseOptions] = useState<CourseOption[]>(COURSE_OPTIONS.map((option) => ({ ...option })));
  const [templateRows, setTemplateRows] = useState<LessonTemplate[]>([]);
  const [templateForm, setTemplateForm] = useState({
    id: 0,
    lesson: "",
    title: "",
    focus: "",
    skills: "",
    activityDirection: "",
    aiStyle: "",
  });
  const [savingTemplate, setSavingTemplate] = useState(false);
  const { toast, showToast } = useToast();
  const formRef = useRef<HTMLDivElement | null>(null);
  const firstInputRef = useRef<HTMLInputElement | null>(null);
  const scrollToFormOnEdit = useScrollToFormOnEdit(formRef, firstInputRef);

  useEffect(() => {
    fetch("/api/teachers?minimal=1").then((r) => r.json()).then(setTeachers);
    fetch("/api/course-options").then((r) => r.json()).then(setCourseOptions);
  }, []);

  useEffect(() => {
    fetch(`/api/lesson-templates?courseType=${encodeURIComponent(manageCourse)}`)
      .then((r) => r.json())
      .then(setTemplateRows);
  }, [manageCourse]);

  async function reloadTemplates() {
    const rows = await fetch(`/api/lesson-templates?courseType=${encodeURIComponent(manageCourse)}`).then((r) => r.json());
    setTemplateRows(rows);
  }

  async function saveTemplate() {
    const payload = {
      courseType: manageCourse,
      lesson: Number(templateForm.lesson),
      title: templateForm.title,
      focus: templateForm.focus,
      skills: templateForm.skills,
      activityDirection: templateForm.activityDirection,
      aiStyle: templateForm.aiStyle,
    };
    if (!payload.lesson || !payload.title.trim()) return alert("請填寫堂數與課程名稱");
    if (savingTemplate) return;
    setSavingTemplate(true);
    const url = templateForm.id ? `/api/lesson-templates/${templateForm.id}` : "/api/lesson-templates";
    try {
      const res = await fetch(url, {
        method: templateForm.id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      await ensureOk(res, "課程內容庫儲存失敗");
      await reloadTemplates();
      setTemplateForm({ id: 0, lesson: "", title: "", focus: "", skills: "", activityDirection: "", aiStyle: "" });
      showToast("success", "課程內容庫已儲存");
    } catch (e) {
      showToast("error", (e as Error).message || "課程內容庫儲存失敗", 3000);
    } finally {
      setSavingTemplate(false);
    }
  }

  async function deleteTemplate(id: number) {
    if (!confirm("確定刪除此堂課的內容庫？")) return;
    await fetch(`/api/lesson-templates/${id}`, { method: "DELETE" });
    setTemplateRows((rows) => rows.filter((r) => r.id !== id));
    showToast("success", "課程內容庫已刪除");
  }

  function editTemplate(row: LessonTemplate) {
    setTemplateForm({
      id: row.id,
      lesson: String(row.lesson),
      title: row.title,
      focus: row.focus || "",
      skills: row.skills.join("、"),
      activityDirection: row.activityDirection || "",
      aiStyle: row.aiStyle || "",
    });
    scrollToFormOnEdit();
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await Promise.resolve();
      setLoading(true);
      const params = new URLSearchParams({ year: String(filterYear), month: String(filterMonth), page: String(page), pageSize: String(pageSize) });
      if (dept) params.set("dept", dept);
      if (filterTeacher) params.set("teacherId", filterTeacher);
      if (filterSchool) params.set("school", filterSchool);
      const r = await fetch(`/api/progress?${params}`);
      const data: PageResult<ProgressRecord> = await r.json();
      if (cancelled) return;
      setRecords(data.items);
      setTotal(data.total);
      const schoolSet = [...new Set(data.items.map((rec) => rec.course.school))].sort();
      setSchools(schoolSet);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [filterYear, filterMonth, dept, filterTeacher, filterSchool, page]);

  const months = Array.from({ length: 12 }, (_, i) => i + 1);
  const years = [2024, 2025, 2026];

  const grouped = records.reduce<Record<string, ProgressRecord[]>>((acc, r) => {
    const key = r.course.school;
    if (!acc[key]) acc[key] = [];
    acc[key].push(r);
    return acc;
  }, {});
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  function parseList(value: string | undefined) {
    return parseAbilities(value);
  }

  function primaryReportText(value: string | undefined) {
    if (!value) return "";
    const lines = value.split("\n").map((line) => line.trim()).filter(Boolean);
    return lines[0] ?? "";
  }

  async function resendSchoolNotify(id: number) {
    try {
      const res = await fetch(`/api/progress/${id}/notify-school`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || data.error || "園所通知發送失敗");
      showToast("success", "園所通知已重新發送");
      setRecords((items) => items.map((item) => item.id === id ? { ...item, schoolNotifyStatus: "通知成功", schoolNotifyError: "" } : item));
    } catch (e) {
      const message = (e as Error).message || "園所通知發送失敗";
      showToast("error", message, 3500);
      setRecords((items) => items.map((item) => item.id === id ? { ...item, schoolNotifyStatus: "通知失敗", schoolNotifyError: message } : item));
    }
  }

  return (
    <div>
      <Toast toast={toast} />
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-800">課程內容與成果</h1>
          <p className="text-sm text-slate-500">統一管理每堂課內容，教練回報與園所成果都使用這裡的資料。</p>
        </div>
      </div>

      <div ref={formRef} className={`bg-white rounded-xl border shadow-sm p-4 mb-6 ${templateForm.id ? "border-blue-200 ring-2 ring-blue-50" : "border-slate-200"}`}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-slate-800">{templateForm.id ? "正在編輯每堂課內容" : "每堂課內容"}</h2>
            <p className="text-xs text-slate-500">只維護一份資料：教練選堂、成果回報與園所成果都使用這裡。</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <select value={manageCourse} onChange={(e) => {
              setManageCourse(e.target.value);
              setTemplateForm({ id: 0, lesson: "", title: "", focus: "", skills: "", activityDirection: "", aiStyle: "" });
            }}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm">
              {courseOptions.map((c) => <option key={c.code} value={c.label}>{c.label}</option>)}
            </select>
            {templateForm.id > 0 && (
              <button
                onClick={() => setTemplateForm({ id: 0, lesson: "", title: "", focus: "", skills: "", activityDirection: "", aiStyle: "" })}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600"
              >
                取消編輯
              </button>
            )}
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-[110px_1fr]">
          <input value={templateForm.lesson} onChange={(e) => setTemplateForm({ ...templateForm, lesson: e.target.value })}
            type="number" min="1" placeholder="第幾堂" className="border border-slate-200 rounded-lg px-3 py-2 text-sm" />
          <input value={templateForm.title} onChange={(e) => setTemplateForm({ ...templateForm, title: e.target.value })}
            placeholder="課程名稱，例如：切滾球練習" className="border border-slate-200 rounded-lg px-3 py-2 text-sm" />
          <textarea value={templateForm.focus} onChange={(e) => setTemplateForm({ ...templateForm, focus: e.target.value })}
            placeholder={"本堂重點，建議 1～3 行，例如：\n控制擊球方向與力道\n練習專注與身體穩定"}
            className="min-h-28 border border-slate-200 rounded-lg px-3 py-2 text-sm md:col-span-2" />
          <input value={templateForm.skills} onChange={(e) => setTemplateForm({ ...templateForm, skills: e.target.value })}
            placeholder="能力培養，用頓號分隔，例如：手眼協調、專注力、肢體協調" className="border border-slate-200 rounded-lg px-3 py-2 text-sm md:col-span-2" />
          <textarea value={templateForm.activityDirection} onChange={(e) => setTemplateForm({ ...templateForm, activityDirection: e.target.value })}
            placeholder="成果回報短文，建議 2～3 行，不要寫太長。"
            className="min-h-24 border border-slate-200 rounded-lg px-3 py-2 text-sm md:col-span-2" />
          <div className="md:col-span-2">
            <SaveButton saving={savingTemplate} onClick={saveTemplate} idleText={templateForm.id ? "更新內容" : "新增內容"} savingText="儲存中…" />
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-3 py-2 text-left w-24">堂數</th>
                <th className="px-3 py-2 text-left w-48">課程名稱</th>
                <th className="px-3 py-2 text-left">本堂重點 / 成果短文</th>
                <th className="px-3 py-2 text-left w-44">能力培養</th>
                <th className="px-3 py-2 text-right w-32">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {templateRows.map((row) => (
                <tr key={row.id}>
                  <td className="px-3 py-2 whitespace-nowrap">第 {row.lesson} 堂</td>
                  <td className="px-3 py-2 font-medium text-slate-700">{row.title}</td>
                  <td className="px-3 py-2 text-xs leading-5 text-slate-500">
                    <div className="line-clamp-2">{row.focus || "尚未填寫本堂重點"}</div>
                    {row.activityDirection && <div className="mt-1 rounded bg-slate-50 px-2 py-1 text-slate-600">{row.activityDirection}</div>}
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-600">{row.skills.length ? row.skills.join("、") : "—"}</td>
                  <td className="px-3 py-2 text-right">
                    <button onClick={() => editTemplate(row)} className="text-blue-600 text-sm mr-3">編輯</button>
                    <button onClick={() => deleteTemplate(row.id)} className="text-red-500 text-sm">刪除</button>
                  </td>
                </tr>
              ))}
              {templateRows.length === 0 && <tr><td colSpan={5} className="text-center py-6 text-slate-400">尚無內容，請新增第一筆</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 mb-6">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex items-center gap-2">
            <label className="text-sm text-slate-600 whitespace-nowrap">部門</label>
            <select value={dept} onChange={(e) => { setDept(e.target.value as never); setPage(1); }}
              className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm">
              <option value="">全部</option>
              {DEPARTMENTS.map((d) => <option key={d}>{d}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-slate-600">年份</label>
            <select value={filterYear} onChange={(e) => { setFilterYear(Number(e.target.value)); setPage(1); }}
              className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm">
              {years.map((y) => <option key={y}>{y}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-slate-600">月份</label>
            <select value={filterMonth} onChange={(e) => { setFilterMonth(Number(e.target.value)); setPage(1); }}
              className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm">
              {months.map((m) => <option key={m} value={m}>{m}月</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-slate-600">老師</label>
            <select value={filterTeacher} onChange={(e) => { setFilterTeacher(e.target.value); setPage(1); }}
              className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm">
              <option value="">全部</option>
              {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          {schools.length > 0 && (
            <div className="flex items-center gap-2">
              <label className="text-sm text-slate-600">園所</label>
              <select value={filterSchool} onChange={(e) => { setFilterSchool(e.target.value); setPage(1); }}
                className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm">
                <option value="">全部</option>
                {schools.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
          )}
          <div className="ml-auto flex items-center gap-2 text-xs text-slate-500">
            <button disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="rounded-lg border border-slate-200 bg-white px-3 py-2 disabled:opacity-40">上一頁</button>
            <span>共 {total} 筆，第 {page} / {totalPages} 頁</span>
            <button disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} className="rounded-lg border border-slate-200 bg-white px-3 py-2 disabled:opacity-40">下一頁</button>
          </div>
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
                          {!r.course.department.includes("安親") && (
                            <span className={`px-1.5 py-0.5 rounded text-xs ${
                              r.schoolNotifyStatus === "通知成功" ? "bg-green-100 text-green-700" :
                                r.schoolNotifyStatus === "通知失敗" ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-500"
                            }`}>
                              園所{r.schoolNotifyStatus || "未通知"}
                            </span>
                          )}
                          {!r.course.department.includes("安親") && r.schoolNotifyStatus === "通知失敗" && (
                            <button onClick={() => resendSchoolNotify(r.id)} className="rounded bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">
                              重新發送
                            </button>
                          )}
                        </div>
                        {!r.course.department.includes("安親") && r.schoolNotifyStatus === "通知失敗" && r.schoolNotifyError && (
                          <div className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
                            園所通知失敗原因：{r.schoolNotifyError}
                          </div>
                        )}
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
