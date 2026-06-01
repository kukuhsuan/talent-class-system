"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { SaveButton } from "@/components/SaveButton";
import { Toast } from "@/components/Toast";
import { ensureOk } from "@/lib/clientApi";
import { useDepartment } from "@/lib/departmentContext";
import { CATEGORY_OPTIONS, courseLabel, normalizeCategory, requiresStudentCount } from "@/lib/courseMeta";
import { taipeiDateIso } from "@/lib/courseDates";
import { useScrollToFormOnEdit } from "@/lib/useScrollToFormOnEdit";
import { useToast } from "@/lib/useToast";

type Teacher = { id: number; name: string };
type Course = { id: number; code: string; school: string; courseType: string; teacher: Teacher; teacherId: number; assistantTeacher?: Teacher | null; assistantTeacherId?: number | null; category: string };
type Attendance = {
  id: number; date: string; course: Course; actualTeacher: Teacher; assistantTeacher?: Teacher | null; assistantTeacherId?: number | null;
  studentCount: number | null; cancelled: boolean; cancelReason: string; makeupDate: string | null; makeupDone: boolean;
  category: string; hours: number; notes: string;
};
type PageResult<T> = { items: T[]; total: number; page: number; pageSize: number };

const today = () => taipeiDateIso();
const EMPTY_FORM = {
  date: today(), courseId: 0, actualTeacherId: 0, assistantTeacherId: null as number | null,
  studentCount: "", cancelled: false, cancelReason: "", makeupDate: "", makeupDone: false, category: "課後", hours: 1, notes: "",
  extraDates: [] as string[],
};

export default function AttendancePage() {
  const { dept } = useDepartment();
  const [records, setRecords] = useState<Attendance[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editing, setEditing] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [filterYear, setFilterYear] = useState(new Date().getFullYear());
  const [filterMonth, setFilterMonth] = useState(new Date().getMonth() + 1);
  const [statusFilter, setStatusFilter] = useState("all");
  const [filterSchool, setFilterSchool] = useState("");
  const [filterTeacher, setFilterTeacher] = useState("");
  const [filterDate, setFilterDate] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 20;
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const { toast, showToast } = useToast();
  const formRef = useRef<HTMLDivElement | null>(null);
  const firstInputRef = useRef<HTMLInputElement | null>(null);
  const scrollToFormOnEdit = useScrollToFormOnEdit(formRef, firstInputRef);

  const load = useCallback(() => {
    const params = new URLSearchParams({ year: String(filterYear), month: String(filterMonth), page: String(page), pageSize: String(pageSize) });
    if (dept) params.set("dept", dept);
    if (filterSchool) params.set("school", filterSchool);
    if (filterTeacher) params.set("teacherId", filterTeacher);
    if (filterDate) params.set("date", filterDate);
    if (filterCategory) params.set("category", filterCategory);
    if (statusFilter !== "all" && statusFilter !== "substitute") params.set("status", statusFilter);
    Promise.all([
      fetch(`/api/attendance?${params}`).then((r) => r.json() as Promise<PageResult<Attendance>>),
      fetch(`/api/courses${dept ? `?dept=${encodeURIComponent(dept)}&includeDates=0` : "?includeDates=0"}`).then((r) => r.json()),
      fetch("/api/teachers").then((r) => r.json()),
    ]).then(([a, c, t]) => { setRecords(a.items); setTotal(a.total); setCourses(c); setTeachers(t); });
  }, [filterYear, filterMonth, page, dept, filterSchool, filterTeacher, filterDate, filterCategory, statusFilter]);

  useEffect(() => { load(); }, [load]);

  const onCourseChange = (courseId: number) => {
    const c = courses.find((x) => x.id === courseId);
    setForm((f) => ({ ...f, courseId, actualTeacherId: c?.teacherId ?? 0, assistantTeacherId: c?.assistantTeacherId ?? null, category: normalizeCategory(c?.category) }));
  };

  const save = async () => {
    if (!form.courseId || !form.actualTeacherId || !form.date) return alert("請填寫必填欄位");
    if (saving) return;
    const headers = { "Content-Type": "application/json" };
    setSaving(true);
    try {
      if (editing !== null) {
        const { extraDates: _x, ...rest } = form;
        void _x;
        const body = JSON.stringify({ ...rest, studentCount: form.studentCount === "" ? null : Number(form.studentCount) });
        const res = await fetch(`/api/attendance/${editing}`, { method: "PUT", headers, body });
        await ensureOk(res, "上課紀錄儲存失敗");
        showToast("success", "上課紀錄已儲存");
      } else {
        const dateSet = [...new Set([form.date, ...form.extraDates].map((d) => d.slice(0, 10)).filter(Boolean))];
        const { extraDates: _x, date: _d, ...rest } = form;
        void _x; void _d;
        const body = JSON.stringify({
          ...rest,
          dates: dateSet,
          studentCount: form.studentCount === "" ? null : Number(form.studentCount),
        });
        const res = await fetch("/api/attendance", { method: "POST", headers, body });
        await ensureOk(res, "上課紀錄新增失敗");
        const data = await res.json();
        if (data.created != null) {
          const parts = [`已建立 ${data.created} 筆上課紀錄`];
          if (data.skipped > 0) parts.push(`略過 ${data.skipped} 筆重複日期`);
          showToast("success", parts.join("；"));
        } else {
          showToast("success", "上課紀錄已儲存");
        }
      }
      setForm(EMPTY_FORM); setEditing(null); setShowForm(false); load();
    } catch (e) {
      showToast("error", (e as Error).message || "上課紀錄儲存失敗", 3000);
    } finally {
      setSaving(false);
    }
  };

  const del = async (id: number) => {
    if (!confirm("確定刪除此筆紀錄？")) return;
    await fetch(`/api/attendance/${id}`, { method: "DELETE" });
    load();
  };

  const edit = (r: Attendance) => {
    setForm({ date: r.date.slice(0, 10), courseId: r.course.id, actualTeacherId: r.actualTeacher.id, assistantTeacherId: r.assistantTeacherId ?? r.course.assistantTeacherId ?? null, studentCount: r.studentCount?.toString() ?? "", cancelled: r.cancelled, cancelReason: r.cancelReason ?? "", makeupDate: r.makeupDate?.slice(0, 10) ?? "", makeupDone: r.makeupDone ?? false, category: normalizeCategory(r.category), hours: r.hours, notes: r.notes, extraDates: [] });
    setEditing(r.id); setShowForm(true);
    scrollToFormOnEdit();
  };

  const fmt = (d: string) => d.slice(0, 10);
  const fmtShort = (d: string) => {
    const day = fmt(d);
    const date = new Date(`${day}T00:00:00`);
    const weekday = ["日", "一", "二", "三", "四", "五", "六"][date.getDay()];
    return `${Number(day.slice(5, 7))}/${Number(day.slice(8, 10))} 週${weekday}`;
  };
  const isPastOrToday = (r: Attendance) => fmt(r.date) <= today();
  const isCountRequired = (r: Attendance) => requiresStudentCount(r.category);
  const countDisplay = (r: Attendance) => r.studentCount ?? (isCountRequired(r) ? "待回報" : "免填");
  const isMissingReport = (r: Attendance) => !r.cancelled && isCountRequired(r) && r.studentCount === null && isPastOrToday(r);
  const isSubstitute = (r: Attendance) => r.actualTeacher.id !== r.course.teacherId;
  const filteredRecords = records.filter((r) => {
    if (statusFilter === "missing") return isMissingReport(r);
    if (statusFilter === "done") return !r.cancelled && (!isCountRequired(r) || r.studentCount !== null);
    if (statusFilter === "substitute") return isSubstitute(r);
    if (statusFilter === "cancelled") return r.cancelled;
    return true;
  });
  const filteredByControls = records;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const statusTabs = [
    { key: "all", label: "全部", count: filteredByControls.length, className: "bg-blue-50 text-blue-700 border-blue-100" },
    { key: "missing", label: "待回報", count: filteredByControls.filter(isMissingReport).length, className: "bg-amber-50 text-amber-700 border-amber-100" },
    { key: "done", label: "已回報", count: filteredByControls.filter((r) => !r.cancelled && (!isCountRequired(r) || r.studentCount !== null)).length, className: "bg-green-50 text-green-700 border-green-100" },
    { key: "substitute", label: "代課", count: filteredByControls.filter(isSubstitute).length, className: "bg-orange-50 text-orange-700 border-orange-100" },
    { key: "cancelled", label: "停課", count: filteredByControls.filter((r) => r.cancelled).length, className: "bg-red-50 text-red-700 border-red-100" },
  ];
  const schoolOptions = [...new Set(courses.map((r) => r.school).filter(Boolean))].sort((a, b) => a.localeCompare(b, "zh-Hant"));
  const summary = {
    todayCourses: records.filter((r) => fmt(r.date) === today()).length,
    missing: records.filter(isMissingReport).length,
    todaySubstitutes: records.filter((r) => fmt(r.date) === today() && isSubstitute(r)).length,
    monthTotal: records.length,
  };
  const groupedRecords = filteredRecords.reduce<Array<{ school: string; rows: Attendance[] }>>((groups, record) => {
    const key = record.course.school || "未命名園所";
    const group = groups.find((item) => item.school === key);
    if (group) group.rows.push(record);
    else groups.push({ school: key, rows: [record] });
    return groups;
  }, []).sort((a, b) => a.school.localeCompare(b.school, "zh-Hant"));
  const toggleGroup = (school: string) => setExpandedGroups((groups) => ({ ...groups, [school]: !groups[school] }));

  return (
    <div>
      <Toast toast={toast} />
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-800">✏️ 上課紀錄</h1>
          <p className="text-sm text-slate-500">共 {total} 筆，目前顯示 {filteredRecords.length} 筆</p>
        </div>
        <div className="flex gap-2">
          <a href={`/api/export/attendance?year=${filterYear}&month=${filterMonth}`} download
            className="bg-green-600 hover:bg-green-700 text-white font-medium px-4 py-2 rounded-lg transition-colors text-sm">
            匯出 Excel
          </a>
          <button onClick={() => { setForm({ ...EMPTY_FORM, date: today(), extraDates: [] }); setEditing(null); setShowForm(true); }}
            className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-2 rounded-lg transition-colors text-sm">
            + 新增上課紀錄
          </button>
        </div>
      </div>

      {showForm && (
        <div ref={formRef} className={`bg-white rounded-xl border shadow-sm p-5 mb-6 ${editing ? "border-blue-200 ring-2 ring-blue-50" : "border-slate-200"}`}>
          <h2 className="font-semibold text-slate-700 mb-4">{editing ? "正在編輯上課紀錄" : "新增上課紀錄"}</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label>上課日期 *</label>
              <input ref={firstInputRef} type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </div>
            {editing === null && (
              <div className="md:col-span-3">
                <label className="block text-sm font-medium text-slate-700 mb-1">其他上課日（選填，可不連續）</label>
                <p className="text-xs text-slate-500 mb-2">與上方日期合併建立多筆紀錄；同日同課程已存在則略過。</p>
                {form.extraDates.length === 0 && (
                  <button type="button" onClick={() => setForm((f) => ({ ...f, extraDates: [""] }))}
                    className="text-sm text-blue-600 hover:underline">+ 加入其他日期</button>
                )}
                <div className="flex flex-col gap-2 mt-1">
                  {form.extraDates.map((d, i) => (
                    <div key={i} className="flex flex-wrap items-center gap-2">
                      <input type="date" value={d} onChange={(e) => {
                        const next = [...form.extraDates];
                        next[i] = e.target.value;
                        setForm({ ...form, extraDates: next });
                      }} />
                      <button type="button" onClick={() => setForm((f) => ({ ...f, extraDates: f.extraDates.filter((_, j) => j !== i) }))}
                        className="text-xs text-red-500 hover:underline">移除</button>
                    </div>
                  ))}
                  {form.extraDates.length > 0 && (
                    <button type="button" onClick={() => setForm((f) => ({ ...f, extraDates: [...f.extraDates, ""] }))}
                      className="self-start text-sm text-blue-600 hover:underline">+ 再加一個日期</button>
                  )}
                </div>
              </div>
            )}
            <div className="md:col-span-2">
              <label>課程 *</label>
              <select value={form.courseId} onChange={(e) => onCourseChange(Number(e.target.value))}>
                <option value={0}>-- 選擇課程 --</option>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>[{c.code}] {c.school} {c.courseType} ({c.teacher.name})</option>
                ))}
              </select>
            </div>
            <div>
              <label>上課老師 *（代課時修改）</label>
              <select value={form.actualTeacherId} onChange={(e) => setForm({ ...form, actualTeacherId: Number(e.target.value) })}>
                <option value={0}>-- 選擇老師 --</option>
                {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div>
              <label>助教老師（選填）</label>
              <select value={form.assistantTeacherId ?? ""} onChange={(e) => setForm({ ...form, assistantTeacherId: e.target.value ? Number(e.target.value) : null })}>
                <option value="">-- 無助教 --</option>
                {teachers
                  .filter((t) => t.id !== form.actualTeacherId)
                  .map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div>
              <label>出席人數{requiresStudentCount(form.category) ? "" : "（課內免填）"}</label>
              <input type="number" value={form.studentCount} onChange={(e) => setForm({ ...form, studentCount: e.target.value })} placeholder={requiresStudentCount(form.category) ? "人數" : "固定班級免填"} />
            </div>
            <div>
              <label>類別</label>
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {CATEGORY_OPTIONS.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label>時數</label>
              <input type="number" step="0.5" value={form.hours} onChange={(e) => setForm({ ...form, hours: Number(e.target.value) })} />
            </div>
            <div>
              <label className="flex items-center gap-2 mt-6 cursor-pointer">
                <input type="checkbox" checked={form.cancelled} onChange={(e) => setForm({ ...form, cancelled: e.target.checked })} className="w-4 h-4" />
                <span className="text-sm font-medium text-slate-700">停課</span>
              </label>
            </div>
            {form.cancelled && (
              <>
                <div>
                  <label>停課原因</label>
                  <input value={form.cancelReason} onChange={(e) => setForm({ ...form, cancelReason: e.target.value })} placeholder="颱風假、園所活動..." />
                </div>
                <div>
                  <label>補課日期</label>
                  <input type="date" value={form.makeupDate} onChange={(e) => setForm({ ...form, makeupDate: e.target.value })} />
                </div>
                <div>
                  <label className="flex items-center gap-2 mt-6 cursor-pointer">
                    <input type="checkbox" checked={form.makeupDone} onChange={(e) => setForm({ ...form, makeupDone: e.target.checked })} className="w-4 h-4" />
                    <span className="text-sm font-medium text-slate-700">已補課</span>
                  </label>
                </div>
              </>
            )}
            <div className="md:col-span-2">
              <label>備註</label>
              <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="備註" />
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <SaveButton saving={saving} onClick={save} />
            <button disabled={saving} onClick={() => { setShowForm(false); setEditing(null); }} className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium px-4 py-3 md:py-2 rounded-lg text-sm disabled:cursor-not-allowed disabled:opacity-60">取消</button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 mb-4 md:grid-cols-4">
        <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3">
          <div className="text-xs font-medium text-blue-600">今日課程</div>
          <div className="mt-1 text-2xl font-bold text-blue-700">{summary.todayCourses}</div>
        </div>
        <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3">
          <div className="text-xs font-medium text-amber-700">待回報</div>
          <div className="mt-1 text-2xl font-bold text-amber-700">{summary.missing}</div>
        </div>
        <div className="rounded-xl border border-orange-100 bg-orange-50 px-4 py-3">
          <div className="text-xs font-medium text-orange-700">今日代課</div>
          <div className="mt-1 text-2xl font-bold text-orange-700">{summary.todaySubstitutes}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
          <div className="text-xs font-medium text-slate-500">本月堂數</div>
          <div className="mt-1 text-2xl font-bold text-slate-800">{summary.monthTotal}</div>
        </div>
      </div>

      <div className="sticky top-0 z-20 mb-4 rounded-xl border border-slate-200 bg-white/95 p-4 shadow-sm backdrop-blur">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
          <select value={filterYear} onChange={(e) => { setFilterYear(Number(e.target.value)); setPage(1); }}>
            {[2025, 2026, 2027].map((y) => <option key={y}>{y}</option>)}
          </select>
          <select value={filterMonth} onChange={(e) => { setFilterMonth(Number(e.target.value)); setPage(1); }}>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => <option key={m} value={m}>{m}月</option>)}
          </select>
          <select value={filterSchool} onChange={(e) => { setFilterSchool(e.target.value); setPage(1); }}>
            <option value="">全部園所</option>
            {schoolOptions.map((school) => <option key={school}>{school}</option>)}
          </select>
          <select value={filterTeacher} onChange={(e) => { setFilterTeacher(e.target.value); setPage(1); }}>
            <option value="">全部老師</option>
            {teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}
          </select>
          <input type="date" value={filterDate} onChange={(e) => { setFilterDate(e.target.value); setPage(1); }} />
          <select value={filterCategory} onChange={(e) => { setFilterCategory(e.target.value); setPage(1); }}>
            <option value="">全部類別</option>
            {CATEGORY_OPTIONS.map((category) => <option key={category}>{category}</option>)}
          </select>
        </div>
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1 md:flex-wrap">
          {statusTabs.map((tab) => (
            <button key={tab.key} onClick={() => { setStatusFilter(tab.key); setPage(1); }}
              className={`shrink-0 rounded-full border px-3 py-2 text-xs font-medium transition-colors ${statusFilter === tab.key ? tab.className : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"}`}>
              {tab.label} <span className="ml-1 font-semibold">{tab.count}</span>
            </button>
          ))}
          {(filterSchool || filterTeacher || filterDate || filterCategory || statusFilter !== "all") && (
            <button onClick={() => { setFilterSchool(""); setFilterTeacher(""); setFilterDate(""); setFilterCategory(""); setStatusFilter("all"); setPage(1); }}
              className="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-500 hover:bg-slate-100">
              清除篩選
            </button>
          )}
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
          <span>目前顯示 {filteredRecords.length} 筆，依園所收合顯示</span>
          <div className="flex items-center gap-2">
            <button disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="rounded-lg border border-slate-200 bg-white px-3 py-1 disabled:opacity-40">上一頁</button>
            <span>第 {page} / {totalPages} 頁</span>
            <button disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} className="rounded-lg border border-slate-200 bg-white px-3 py-1 disabled:opacity-40">下一頁</button>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {groupedRecords.map((group) => {
          const opened = Boolean(expandedGroups[group.school]);
          const missing = group.rows.filter(isMissingReport).length;
          const substitutes = group.rows.filter(isSubstitute).length;
          const totalStudents = group.rows.reduce((sum, row) => sum + (row.studentCount ?? 0), 0);
          return (
            <div key={group.school} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <button type="button" onClick={() => toggleGroup(group.school)}
                className="flex w-full flex-col gap-3 px-4 py-4 text-left hover:bg-slate-50 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-semibold text-slate-900">{group.school}</span>
                    <span className="text-sm text-slate-400">{opened ? "收合" : "展開"}</span>
                  </div>
                  <div className="mt-1 text-sm text-slate-500">本月 {group.rows.length} 堂 · 出席合計 {totalStudents} 人</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {missing > 0 && <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">待回報 {missing}</span>}
                  {substitutes > 0 && <span className="rounded-full bg-orange-50 px-3 py-1 text-xs font-medium text-orange-700">代課 {substitutes}</span>}
                  <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">{group.rows.length} 筆</span>
                </div>
              </button>

              {opened && (
                <div className="border-t border-slate-100">
                  <div className="divide-y divide-slate-100 md:hidden">
                    {group.rows.map((r) => {
                      const substitute = isSubstitute(r);
                      return (
                        <div key={r.id} className={`p-4 ${r.cancelled ? "opacity-60" : ""}`}>
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="font-semibold text-slate-900">{fmtShort(r.date)}</div>
                              <div className="mt-1 text-sm text-slate-600">{courseLabel(r.course.courseType)}｜主教 {r.actualTeacher.name}</div>
                              {(r.assistantTeacher || r.course.assistantTeacher) && <div className="mt-1 text-xs text-blue-600">助教 {(r.assistantTeacher ?? r.course.assistantTeacher)?.name}</div>}
                            </div>
                            {r.cancelled ? <span className="rounded-full bg-red-100 px-2 py-1 text-xs text-red-600">停課</span> : <span className="rounded-full bg-green-100 px-2 py-1 text-xs text-green-600">出課</span>}
                          </div>
                          <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                            <div className="rounded-lg bg-slate-50 px-3 py-2"><div className="text-xs text-slate-400">人數</div><div className="font-medium">{countDisplay(r)}</div></div>
                            <div className="rounded-lg bg-slate-50 px-3 py-2"><div className="text-xs text-slate-400">類別 / 時數</div><div className="font-medium">{normalizeCategory(r.category)}｜{r.hours}h</div></div>
                          </div>
                          {substitute && <div className="mt-2 inline-flex rounded-full bg-orange-100 px-2 py-0.5 text-xs text-orange-700">代課</div>}
                          {(r.cancelReason || r.notes) && <div className="mt-2 text-xs text-slate-500">{r.cancelReason || r.notes}</div>}
                          <div className="mt-4 flex gap-4">
                            <button onClick={() => edit(r)} className="text-sm font-medium text-blue-600 hover:text-blue-800">編輯</button>
                            <button onClick={() => del(r.id)} className="text-sm font-medium text-red-500 hover:text-red-700">刪除</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="hidden overflow-x-auto md:block">
                    <table className="w-full min-w-[980px] text-sm">
                      <thead className="bg-slate-50 text-slate-500">
                        <tr>
                          <th className="px-4 py-3 text-left font-semibold">日期</th>
                          <th className="px-4 py-3 text-left font-semibold">課程</th>
                          <th className="px-4 py-3 text-left font-semibold">老師</th>
                          <th className="px-4 py-3 text-center font-semibold">人數</th>
                          <th className="px-4 py-3 text-left font-semibold">類別</th>
                          <th className="px-4 py-3 text-center font-semibold">時數</th>
                          <th className="px-4 py-3 text-left font-semibold">狀態</th>
                          <th className="px-4 py-3 text-left font-semibold">備註</th>
                          <th className="px-4 py-3 text-left font-semibold">操作</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {group.rows.map((r) => {
                          const substitute = isSubstitute(r);
                          return (
                            <tr key={r.id} className={`${r.cancelled ? "opacity-50" : ""} hover:bg-slate-50/70`}>
                              <td className="px-4 py-4 whitespace-nowrap">{fmtShort(r.date)}</td>
                              <td className="px-4 py-4">
                                <div className="font-medium text-slate-900">{courseLabel(r.course.courseType)}</div>
                                <div className="font-mono text-xs text-slate-400">{r.course.code}</div>
                              </td>
                              <td className="px-4 py-4">
                                <div className={substitute ? "font-medium text-orange-700" : "text-slate-700"}>{r.actualTeacher.name}</div>
                                {(r.assistantTeacher || r.course.assistantTeacher) && <div className="mt-1 text-xs text-blue-600">助教：{(r.assistantTeacher ?? r.course.assistantTeacher)?.name}</div>}
                                {substitute && <div className="mt-1 inline-flex rounded-full bg-orange-100 px-2 py-0.5 text-xs text-orange-700">代課</div>}
                              </td>
                              <td className="px-4 py-4 text-center">
                                {r.studentCount ?? (isCountRequired(r) ? <span className="text-amber-600">待回報</span> : <span className="text-slate-500">免填</span>)}
                              </td>
                              <td className="px-4 py-4"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">{normalizeCategory(r.category)}</span></td>
                              <td className="px-4 py-4 text-center">{r.hours}h</td>
                              <td className="px-4 py-4">
                                {r.cancelled ? <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs text-red-600">停課</span> : <span className="rounded-full bg-green-100 px-2.5 py-1 text-xs text-green-600">出課</span>}
                              </td>
                              <td className="max-w-[220px] truncate px-4 py-4 text-xs text-slate-500" title={r.cancelReason || r.notes || ""}>{r.cancelReason || r.notes || "-"}</td>
                              <td className="px-4 py-4">
                                <div className="flex gap-4 whitespace-nowrap">
                                  <button onClick={() => edit(r)} className="text-sm font-medium text-blue-600 hover:text-blue-800">編輯</button>
                                  <button onClick={() => del(r.id)} className="text-sm font-medium text-red-500 hover:text-red-700">刪除</button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {groupedRecords.length === 0 && (
          <div className="rounded-xl border border-slate-200 bg-white py-12 text-center text-slate-400">目前篩選沒有上課紀錄</div>
        )}
      </div>
    </div>
  );
}
