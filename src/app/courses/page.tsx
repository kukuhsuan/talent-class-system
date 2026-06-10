"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { SaveButton } from "@/components/SaveButton";
import { Toast } from "@/components/Toast";
import { useDepartment, DEPARTMENTS } from "@/lib/departmentContext";
import { expandIsoDateRange, expandWeeklyDates, formatMonthDay, parseCourseDateInput, weekdayOfIso } from "@/lib/courseDates";
import { CATEGORY_BADGE_CLASS, CATEGORY_OPTIONS, COURSE_OPTIONS, courseLabel, normalizeCategory, normalizeDepartment, normalizeRegion, REGION_OPTIONS } from "@/lib/courseMeta";
import { useScrollToFormOnEdit } from "@/lib/useScrollToFormOnEdit";
import { useToast } from "@/lib/useToast";

type Teacher = { id: number; name: string };
type School = { id: number; name: string; type: string; region: string; address: string };
type CourseOption = { code: string; label: string };
type Course = {
  id: number; code: string; region: string; teacher: Teacher; teacherId: number; assistantTeacher?: Teacher | null; assistantTeacherId?: number | null;
  school: string; schoolId: number | null; courseType: string; address: string; dayOfWeek: string; time: string; payrollHours: number | null;
  category: string; department: string; enrollCount: string; isActive: boolean; notes: string;
  recurrenceType?: string; startDate?: string | null; endDate?: string | null; weekday?: string;
  scheduledDates?: string[];
};
type PageResult<T> = { items: T[]; total: number; page: number; pageSize: number };

type DeptOption = (typeof DEPARTMENTS)[number];

function coerceDept(s: string): DeptOption {
  return normalizeDepartment(s) as DeptOption;
}

const DAYS = ["星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
const DATE_MODES = [
  { value: "single", label: "單日" },
  { value: "multiple", label: "多日指定" },
  { value: "range", label: "日期區間" },
  { value: "weekly", label: "每週循環" },
] as const;

const EMPTY_FORM = {
  code: "", region: "", teacherId: 0, assistantTeacherId: null as number | null, school: "", schoolId: null as number | null,
  courseType: "", address: "", dayOfWeek: "星期一", time: "", payrollHours: "", category: "課後", department: "幼兒園" as DeptOption, enrollCount: "", isActive: true, notes: "",
  dateMode: "multiple",
  scheduledDateText: "",
  scheduledDateYear: new Date().getFullYear(),
  scheduledDates: [] as string[],
  rangeStart: "",
  rangeEnd: "",
  recurringStart: "",
  recurringEnd: "",
  recurringDays: ["星期一"] as string[],
};

type CourseForm = typeof EMPTY_FORM;

function collectScheduledDates(form: CourseForm) {
  if (form.dateMode === "single") return form.scheduledDates[0] ? [form.scheduledDates[0]] : [];
  if (form.dateMode === "range") return expandIsoDateRange(form.rangeStart, form.rangeEnd);
  if (form.dateMode === "weekly") return expandWeeklyDates(form.recurringStart, form.recurringEnd, form.recurringDays);

  const parsed = parseCourseDateInput(form.scheduledDateText, Number(form.scheduledDateYear));
  return [...new Set([
    ...form.scheduledDates.map((d) => d.trim().slice(0, 10)).filter(Boolean),
    ...parsed.dates,
  ])].sort();
}

function describeCourse(c: Course) {
  return `${c.code}｜${c.school}｜${courseLabel(c.courseType)}｜${c.teacher.name}｜${c.dayOfWeek} ${c.time || ""}`;
}

function displayTeacherName(name: string) {
  return name === "待排老師" ? "未指派 / 待排老師" : name;
}

function uniqueSortedDates(dates: string[]) {
  return [...new Set(dates.map((d) => d.slice(0, 10)).filter(Boolean))].sort();
}

function inferWeeklyDates(dates: string[]) {
  const unique = uniqueSortedDates(dates);
  if (unique.length < 2) return null;

  const weekdays = [...new Set(unique.map(weekdayOfIso))];
  if (weekdays.length !== 1) return null;

  for (let i = 1; i < unique.length; i++) {
    const prev = new Date(`${unique[i - 1]}T00:00:00.000Z`).getTime();
    const next = new Date(`${unique[i]}T00:00:00.000Z`).getTime();
    if ((next - prev) / 86400000 !== 7) return null;
  }

  return {
    start: unique[0],
    end: unique[unique.length - 1],
    days: weekdays,
  };
}

async function readErrorMessage(res: Response, fallback: string) {
  if (res.status === 401 || res.status === 403 || res.redirected || res.url.includes("/login")) {
    return "登入狀態已失效，請重新登入後再試";
  }

  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const data = await res.json().catch(() => ({}));
    return data.error ?? fallback;
  }

  const text = await res.text().catch(() => "");
  if (text.trim()) return `${fallback}（HTTP ${res.status}：${text.trim().slice(0, 120)}）`;
  return `${fallback}（HTTP ${res.status}）`;
}

export default function CoursesPage() {
  const { dept } = useDepartment();
  const [courses, setCourses] = useState<Course[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [courseOptions, setCourseOptions] = useState<CourseOption[]>(COURSE_OPTIONS.map((option) => ({ ...option })));
  const [form, setForm] = useState({ ...EMPTY_FORM, department: coerceDept(dept || "幼兒園") });
  const [editing, setEditing] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [filterDepartment, setFilterDepartment] = useState(dept || "");
  const [filterRegion, setFilterRegion] = useState("");
  const [filterTeacher, setFilterTeacher] = useState("");
  const [filterMonth, setFilterMonth] = useState("");
  const [filterYear, setFilterYear] = useState(new Date().getFullYear());
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 20;
  const [saving, setSaving] = useState(false);
  const [generatingCode, setGeneratingCode] = useState(false);
  const [showCourseOptionForm, setShowCourseOptionForm] = useState(false);
  const [newCourseOption, setNewCourseOption] = useState("");
  const [savingCourseOption, setSavingCourseOption] = useState(false);
  const { toast, showToast } = useToast();
  const formRef = useRef<HTMLDivElement | null>(null);
  const firstInputRef = useRef<HTMLInputElement | null>(null);
  const scrollToFormOnEdit = useScrollToFormOnEdit(formRef, firstInputRef);

  const load = useCallback(
    () => {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize), includeDates: "0" });
      const effectiveDept = filterDepartment || dept;
      if (effectiveDept) params.set("dept", effectiveDept);
      if (filterRegion) params.set("region", filterRegion);
      if (filterTeacher) params.set("teacher", filterTeacher);
      if (filterMonth) {
        params.set("month", filterMonth);
        params.set("year", String(filterYear));
      }
      if (search.trim()) params.set("search", search.trim());
      return (
      Promise.all([
        fetch(`/api/courses?${params}`, { cache: "no-store" }).then((r) => r.json() as Promise<PageResult<Course>>),
        fetch("/api/teachers").then((r) => r.json()),
        fetch("/api/schools").then((r) => r.json()),
        fetch("/api/course-options").then((r) => r.json()),
      ]).then(([c, t, s, o]) => { setCourses(c.items); setTotal(c.total); setTeachers(t); setSchools(s); setCourseOptions(o); })
      );
    },
    [dept, filterDepartment, filterMonth, filterRegion, filterTeacher, filterYear, page, search],
  );

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const queryDept = params.get("dept");
    const queryTeacher = params.get("teacher");
    const queryMonth = params.get("month");
    const queryYear = params.get("year");
    if (queryDept) setFilterDepartment(queryDept);
    if (queryTeacher) setFilterTeacher(queryTeacher);
    if (queryMonth) setFilterMonth(queryMonth);
    if (queryYear) setFilterYear(Number(queryYear) || new Date().getFullYear());
  }, []);

  function selectSchool(schoolId: number) {
    const s = schools.find((s) => s.id === schoolId);
    if (s) setForm((f) => ({
      ...f,
      schoolId: s.id,
      school: s.name,
      region: normalizeRegion(s.region),
      department: s.type ? coerceDept(s.type) : f.department,
      address: editing === null ? (s.address || f.address || "") : f.address,
    }));
    else setForm((f) => ({ ...f, schoolId: null }));
  }

  async function fetchNextCode() {
    setGeneratingCode(true);
    try {
      const res = await fetch("/api/courses?nextCode=1");
      if (!res.ok) throw new Error("課程編號產生失敗");
      const data = await res.json();
      setForm((f) => ({ ...f, code: data.code ?? f.code }));
    } catch (e) {
      showToast("error", (e as Error).message || "課程編號產生失敗", 2500);
    } finally {
      setGeneratingCode(false);
    }
  }

  async function saveCourseOption() {
    const label = newCourseOption.trim();
    if (!label) return alert("請輸入課程名稱");
    if (savingCourseOption) return;
    setSavingCourseOption(true);
    try {
      const res = await fetch("/api/course-options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label }),
      });
      if (!res.ok) throw new Error(await readErrorMessage(res, "課程選項新增失敗"));
      const option = await res.json();
      setCourseOptions((options) => {
        const next = options.filter((item) => item.code !== option.code);
        return [...next, option].sort((a, b) => a.label.localeCompare(b.label, "zh-Hant"));
      });
      setForm((f) => ({ ...f, courseType: option.code }));
      setNewCourseOption("");
      setShowCourseOptionForm(false);
      showToast("success", "課程選項已新增");
    } catch (e) {
      showToast("error", (e as Error).message || "課程選項新增失敗", 3000);
    } finally {
      setSavingCourseOption(false);
    }
  }

  function startCreate() {
    setForm({ ...EMPTY_FORM, department: coerceDept(dept || "幼兒園") });
    setEditing(null);
    setShowForm(true);
    void fetchNextCode();
  }

  const save = async () => {
    if (!form.school.trim() || !form.teacherId) return alert("請填寫必填欄位");
    if (saving) return;
    const parsed = form.dateMode === "multiple" ? parseCourseDateInput(form.scheduledDateText, Number(form.scheduledDateYear)) : { errors: [] };
    if (parsed.errors.length > 0) return alert(`日期格式無法解析：${parsed.errors.join("、")}`);
    const scheduledDates = collectScheduledDates(form);
    if ((form.dateMode === "range" || form.dateMode === "weekly") && scheduledDates.length === 0) return alert("請確認日期區間與星期設定");
    const autoDay = scheduledDates[0] ? weekdayOfIso(scheduledDates[0]) : form.dayOfWeek;
    const targetDays = new Set((scheduledDates.length > 0 ? scheduledDates.map(weekdayOfIso) : [form.dayOfWeek]).filter(Boolean));
    const assistantId = form.assistantTeacherId ? Number(form.assistantTeacherId) : null;
    const conflicts = courses
      .filter((c) => c.id !== editing && c.time && form.time && c.time.trim() === form.time.trim() && targetDays.has(c.dayOfWeek))
      .filter((c) => {
        const teacherCrash = c.teacherId === form.teacherId || c.assistantTeacherId === form.teacherId;
        const assistantCrash = assistantId ? c.teacherId === assistantId || c.assistantTeacherId === assistantId : false;
        const schoolCrash = form.schoolId ? c.schoolId === form.schoolId : c.school === form.school;
        return teacherCrash || assistantCrash || schoolCrash;
      })
      .map((c) => {
        const teacherCrash = c.teacherId === form.teacherId || c.assistantTeacherId === form.teacherId;
        const assistantCrash = assistantId ? c.teacherId === assistantId || c.assistantTeacherId === assistantId : false;
        return `${teacherCrash ? "主教撞課" : assistantCrash ? "助教撞課" : "園所撞課"}：${describeCourse(c)}`;
      });
    if (conflicts.length > 0 && !confirm(`偵測到可能排課衝突：\n\n${conflicts.slice(0, 6).join("\n")}\n\n仍要儲存嗎？`)) return;
    const body = JSON.stringify({ ...form, region: normalizeRegion(form.region), department: normalizeDepartment(form.department), category: normalizeCategory(form.category), dayOfWeek: autoDay, scheduledDates });
    const headers = { "Content-Type": "application/json" };
    setSaving(true);
    try {
      let res: Response;
      if (editing !== null) {
        res = await fetch(`/api/courses/${editing}`, { method: "PUT", headers, body });
      } else {
        res = await fetch("/api/courses", { method: "POST", headers, body });
      }
      if (!res.ok) {
        const message = await readErrorMessage(res, "課程儲存失敗");
        if (message.includes("登入狀態")) window.location.href = "/login";
        throw new Error(message);
      }
      const result = await res.json().catch(() => ({}));
      const wasAfterSchool = form.department === "安親班";
      setForm({ ...EMPTY_FORM, department: coerceDept(dept || "幼兒園") }); setEditing(null); setShowForm(false); load();
      const warnings = Array.isArray(result.warnings) ? result.warnings.filter(Boolean) : [];
      const baseMsg = warnings.length > 0 ? `課程已儲存，但${warnings[0]}` : "課程已儲存";
      const afterSchoolHint = wasAfterSchool ? "｜請至「出勤紀錄」設定每天老師" : "";
      showToast("success", baseMsg + afterSchoolHint, warnings.length > 0 || wasAfterSchool ? 5000 : 2500);
    } catch (e) {
      showToast("error", (e as Error).message || "課程儲存失敗", 3500);
    } finally {
      setSaving(false);
    }
  };

  const del = async (id: number, code: string) => {
    if (!confirm(`確定刪除課程「${code}」？相關出勤紀錄也會一併刪除。`)) return;
    const res = await fetch(`/api/courses/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const message = await readErrorMessage(res, "刪除失敗，請確認是否仍有關聯資料");
      alert(message);
      if (message.includes("登入狀態")) window.location.href = "/login";
      return;
    }
    load();
  };

  const edit = async (c: Course) => {
    // Fetch full course with scheduledDates on demand (list loads with includeDates=0)
    let fullCourse = c;
    try {
      const res = await fetch(`/api/courses/${c.id}`);
      if (res.ok) fullCourse = await res.json();
    } catch { /* fallback to c */ }

    const existingDates = uniqueSortedDates(fullCourse.scheduledDates ?? []);
    const inferredWeekly = inferWeeklyDates(existingDates);
    const persistedMode = DATE_MODES.some((mode) => mode.value === fullCourse.recurrenceType) ? fullCourse.recurrenceType : "";
    const dateMode = persistedMode || (inferredWeekly ? "weekly" : "multiple");
    const recurrenceStart = fullCourse.startDate?.slice(0, 10) || inferredWeekly?.start || "";
    const recurrenceEnd = fullCourse.endDate?.slice(0, 10) || inferredWeekly?.end || "";
    const recurrenceDays = fullCourse.weekday?.split(",").filter(Boolean) || inferredWeekly?.days || [fullCourse.dayOfWeek || "星期一"];
    setForm({ code: fullCourse.code, region: normalizeRegion(fullCourse.region), teacherId: fullCourse.teacherId, assistantTeacherId: fullCourse.assistantTeacherId ?? null, school: fullCourse.school, schoolId: fullCourse.schoolId,
      courseType: fullCourse.courseType, address: fullCourse.address || "", dayOfWeek: fullCourse.dayOfWeek, time: fullCourse.time, payrollHours: fullCourse.payrollHours == null ? "" : String(fullCourse.payrollHours), category: normalizeCategory(fullCourse.category),
      department: coerceDept(fullCourse.department || "幼兒園"), enrollCount: fullCourse.enrollCount, isActive: fullCourse.isActive, notes: fullCourse.notes,
      dateMode, scheduledDateText: "", scheduledDateYear: existingDates[0] ? Number(existingDates[0].slice(0, 4)) : new Date().getFullYear(), scheduledDates: dateMode === "weekly" ? [] : existingDates,
      rangeStart: dateMode === "range" ? recurrenceStart : "", rangeEnd: dateMode === "range" ? recurrenceEnd : "",
      recurringStart: dateMode === "weekly" ? recurrenceStart : "", recurringEnd: dateMode === "weekly" ? recurrenceEnd : "", recurringDays: recurrenceDays });
    setEditing(c.id); setShowForm(true);
    scrollToFormOnEdit();
  };

  const regions = [...new Set([...REGION_OPTIONS, ...schools.map((s) => normalizeRegion(s.region)).filter(Boolean)])].sort();
  const filtered = courses;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const parsedDates = form.dateMode === "multiple" ? parseCourseDateInput(form.scheduledDateText, Number(form.scheduledDateYear)) : { dates: [], errors: [] };
  const previewDates = collectScheduledDates(form);

  return (
    <div>
      <Toast toast={toast} />
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-800">課程排班</h1>
          <p className="text-sm text-slate-500">共 {total} 門課程，目前顯示 {courses.length} 門</p>
        </div>
        <div className="flex gap-2">
          <Link href="/courses/summer-import"
            className="rounded-lg border border-purple-200 bg-purple-50 px-4 py-2 text-sm font-medium text-purple-700 hover:bg-purple-100">
            暑期匯入
          </Link>
          <button onClick={startCreate}
            className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-2 rounded-lg transition-colors text-sm">
            + 新增課程
          </button>
        </div>
      </div>

      {showForm && (
        <div ref={formRef} className={`bg-white rounded-xl border shadow-sm p-5 md:p-6 mb-6 ${editing != null ? "border-blue-200 ring-2 ring-blue-50" : "border-slate-200"}`}>
          <h2 className="font-semibold text-slate-700 mb-4">{editing != null ? "正在編輯課程" : "新增課程"}</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
            <div className="md:col-span-4 text-xs font-semibold text-slate-500 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">基本資料</div>
            <div>
              <label>課程編號（自動）</label>
              <div className="flex gap-2">
                <input ref={firstInputRef} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="系統自動產生" />
                <button
                  type="button"
                  onClick={fetchNextCode}
                  disabled={editing !== null || generatingCode}
                  className="shrink-0 rounded-lg border border-slate-200 px-3 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {generatingCode ? "產生中" : "自動"}
                </button>
              </div>
            </div>
            <div className="md:col-span-2">
              <label>園所名稱 *</label>
              <select value={form.schoolId ?? ""} onChange={(e) => selectSchool(Number(e.target.value))}>
                <option value="">-- 從園所管理選擇，或下方手動輸入 --</option>
                {schools.map((s) => <option key={s.id} value={s.id}>{s.region ? `[${normalizeRegion(s.region)}] ` : ""}{s.type ? `${normalizeDepartment(s.type)}｜` : ""}{s.name}</option>)}
              </select>
              {form.schoolId && (
                <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  <div className="font-medium text-slate-900">{form.school}</div>
                  <div className="mt-1 flex flex-wrap gap-2 text-xs text-slate-500">
                    {form.region && <span>{normalizeRegion(form.region)}</span>}
                    {form.department && <span>{normalizeDepartment(form.department)}</span>}
                    {form.address && <span className="break-all">{form.address}</span>}
                  </div>
                </div>
              )}
            </div>
            {!form.schoolId && <div>
              <label>手動輸入園所名稱 *</label>
              <input value={form.school} onChange={(e) => setForm({ ...form, school: e.target.value })} placeholder="學校簡稱" />
            </div>}
            <div>
              <label>地區</label>
              <select value={normalizeRegion(form.region)} onChange={(e) => setForm({ ...form, region: e.target.value })}>
                <option value="">-- 選擇地區 --</option>
                {REGION_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div className="md:col-span-4 text-xs font-semibold text-slate-500 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">課程資訊</div>
            <div className="md:col-span-2">
              <label>上課地址</label>
              <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="可貼完整地址，之後可連 Google Maps" />
            </div>
            <div>
              <label>{form.department === "安親班" ? "課程主教（佔位）" : "負責老師 *"}</label>
              <select value={form.teacherId} onChange={(e) => setForm({ ...form, teacherId: Number(e.target.value) })}>
                <option value={0}>-- 選擇老師 --</option>
                {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              {form.department === "安親班" && (
                <p className="mt-1 text-xs text-amber-600">安親班每天老師請在「出勤紀錄」逐日設定。此欄選「待排老師」即可。</p>
              )}
            </div>
            {form.department !== "安親班" && (
              <div>
                <label>助教老師（選填）</label>
                <select
                  value={form.assistantTeacherId ?? ""}
                  onChange={(e) => setForm({ ...form, assistantTeacherId: e.target.value ? Number(e.target.value) : null })}
                  className="bg-blue-50/40"
                >
                  <option value="">-- 無助教 --</option>
                  {teachers
                    .filter((t) => t.id !== form.teacherId)
                    .map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                <p className="mt-1 text-xs text-blue-500">選填，會同步到出勤與助教薪資。</p>
              </div>
            )}
            <div>
              <label>課程項目</label>
              <select value={form.courseType} onChange={(e) => setForm({ ...form, courseType: e.target.value })}>
                <option value="">-- 選擇課程 --</option>
                {courseOptions.map((c) => <option key={c.code} value={c.code}>{c.label}{c.label !== c.code ? `（${c.code}）` : ""}</option>)}
                {form.courseType && !courseOptions.some((c) => c.code === form.courseType) && <option value={form.courseType}>{courseLabel(form.courseType)}（既有資料）</option>}
              </select>
              <button type="button" onClick={() => setShowCourseOptionForm((v) => !v)}
                className="mt-2 text-xs font-medium text-blue-600 hover:text-blue-800">
                + 新增課程選項
              </button>
              {showCourseOptionForm && (
                <div className="mt-2 flex gap-2 rounded-lg border border-blue-100 bg-blue-50/50 p-2">
                  <input value={newCourseOption} onChange={(e) => setNewCourseOption(e.target.value)} placeholder="例如：美術、直排輪" />
                  <button type="button" disabled={savingCourseOption} onClick={saveCourseOption}
                    className="shrink-0 rounded-lg bg-blue-600 px-3 text-xs font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60">
                    {savingCourseOption ? "新增中…" : "新增"}
                  </button>
                </div>
              )}
            </div>
            <div>
              <label>星期幾</label>
              <select value={form.dayOfWeek} onChange={(e) => setForm({ ...form, dayOfWeek: e.target.value })}>
                {DAYS.map((d) => <option key={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <label>上課時間</label>
              <input value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} placeholder="16:00-17:00" />
            </div>
            <div>
              <label>計薪時數</label>
              <input type="number" min="0" step="0.5" value={form.payrollHours} onChange={(e) => setForm({ ...form, payrollHours: e.target.value })} placeholder="空白則依時間估算" />
              <p className="mt-1 text-xs text-slate-500">手動填寫後，薪資一律以此為準。</p>
            </div>
            <div>
              <label>類別</label>
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {CATEGORY_OPTIONS.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label>部門</label>
              <select value={normalizeDepartment(form.department)} onChange={(e) => setForm({ ...form, department: coerceDept(e.target.value) })}>
                {DEPARTMENTS.map((d) => <option key={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <label>報名人數</label>
              <input value={form.enrollCount} onChange={(e) => setForm({ ...form, enrollCount: e.target.value })} placeholder="10人" />
            </div>
            <div className="md:col-span-2">
              <label>備註</label>
              <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
            <div className="md:col-span-4 text-xs font-semibold text-slate-500 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">實際日期</div>
            <div className="md:col-span-4 border border-amber-100 bg-amber-50/30 rounded-lg p-4">
              <label className="block text-sm font-medium text-slate-700 mb-2">實際上課日期（選填）</label>
              <p className="text-xs text-slate-500 mb-3">儲存後會建立對應日期的上課紀錄，週課表會依實際日期顯示。</p>
              <div className="flex flex-wrap gap-2 mb-4">
                {DATE_MODES.map((m) => (
                  <button key={m.value} type="button" onClick={() => setForm((f) => {
                    const existingDates = uniqueSortedDates(f.scheduledDates);
                    if (m.value === "weekly") {
                      const inferred = inferWeeklyDates(existingDates);
                      return {
                        ...f,
                        dateMode: m.value,
                        recurringStart: f.recurringStart || inferred?.start || existingDates[0] || "",
                        recurringEnd: f.recurringEnd || inferred?.end || existingDates[existingDates.length - 1] || "",
                        recurringDays: f.recurringDays.length > 0 ? f.recurringDays : (inferred?.days ?? [f.dayOfWeek || "星期一"]),
                      };
                    }
                    return { ...f, dateMode: m.value };
                  })}
                    className={`rounded-full border px-3 py-1.5 text-xs font-medium ${form.dateMode === m.value ? "bg-amber-700 text-white border-amber-700" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}>
                    {m.label}
                  </button>
                ))}
              </div>

              {form.dateMode === "single" && (
                <div className="max-w-xs">
                  <label className="text-xs">上課日期</label>
                  <input type="date" value={form.scheduledDates[0] ?? ""} onChange={(e) => setForm({ ...form, scheduledDates: [e.target.value] })} />
                </div>
              )}

              {form.dateMode === "multiple" && (
                <>
                  <div className="grid md:grid-cols-[120px_1fr] gap-3">
                    <div>
                      <label className="text-xs">年份</label>
                      <input type="number" value={form.scheduledDateYear} onChange={(e) => setForm({ ...form, scheduledDateYear: Number(e.target.value) })} />
                    </div>
                    <div>
                      <label className="text-xs">日期字串</label>
                      <input value={form.scheduledDateText} onChange={(e) => setForm({ ...form, scheduledDateText: e.target.value })} placeholder="7/1、7/6、8、9、10、7/8、15、22、29" />
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 mt-3">
                    {form.scheduledDates.map((d, i) => (
                      <div key={i} className="flex flex-wrap items-center gap-2">
                        <input type="date" value={d} onChange={(e) => {
                          const next = [...form.scheduledDates];
                          next[i] = e.target.value;
                          setForm({ ...form, scheduledDates: next });
                        }} className="text-sm" />
                        <button type="button" onClick={() => setForm((f) => ({ ...f, scheduledDates: f.scheduledDates.filter((_, j) => j !== i) }))}
                          className="text-xs text-red-500 hover:underline">移除</button>
                      </div>
                    ))}
                    <button type="button" onClick={() => setForm((f) => ({ ...f, scheduledDates: [...f.scheduledDates, ""] }))}
                      className="self-start text-sm text-blue-600 hover:underline">+ 加入單日選擇</button>
                  </div>
                </>
              )}

              {form.dateMode === "range" && (
                <div className="grid md:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs">開始日期</label>
                    <input type="date" value={form.rangeStart} onChange={(e) => setForm({ ...form, rangeStart: e.target.value })} />
                  </div>
                  <div>
                    <label className="text-xs">結束日期</label>
                    <input type="date" value={form.rangeEnd} onChange={(e) => setForm({ ...form, rangeEnd: e.target.value })} />
                  </div>
                </div>
              )}

              {form.dateMode === "weekly" && (
                <div className="space-y-3">
                  <div className="grid md:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs">開始日期</label>
                      <input type="date" value={form.recurringStart} onChange={(e) => setForm({ ...form, recurringStart: e.target.value })} />
                    </div>
                    <div>
                      <label className="text-xs">結束日期</label>
                      <input type="date" value={form.recurringEnd} onChange={(e) => setForm({ ...form, recurringEnd: e.target.value })} />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs">每週星期</label>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {DAYS.map((d) => (
                        <label key={d} className={`cursor-pointer rounded-full border px-3 py-1.5 text-xs ${form.recurringDays.includes(d) ? "border-amber-700 bg-amber-700 text-white" : "border-slate-200 bg-white text-slate-600"}`}>
                          <input type="checkbox" className="sr-only" checked={form.recurringDays.includes(d)} onChange={(e) => {
                            const next = e.target.checked ? [...form.recurringDays, d] : form.recurringDays.filter((x) => x !== d);
                            setForm({ ...form, recurringDays: next });
                          }} />
                          {d.replace("星期", "週")}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              )}
              {previewDates.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {previewDates.map((d) => (
                    <span key={d} className="rounded-full bg-amber-50 text-amber-800 border border-amber-200 px-2 py-1 text-xs">
                      {formatMonthDay(d)} {weekdayOfIso(d).replace("星期", "週")}
                    </span>
                  ))}
                </div>
              )}
              {parsedDates.errors.length > 0 && <p className="mt-2 text-xs text-red-500">無法解析：{parsedDates.errors.join("、")}</p>}
            </div>
            <div className="md:col-span-4 flex items-end pb-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} className="w-4 h-4" />
                <span className="text-sm font-medium text-slate-700">開課中</span>
              </label>
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <SaveButton saving={saving} onClick={save} />
            <button disabled={saving} onClick={() => { setShowForm(false); setEditing(null); }} className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium px-4 py-2 rounded-lg text-sm disabled:cursor-not-allowed disabled:opacity-60">取消</button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="grid gap-3 border-b border-slate-100 p-4 md:grid-cols-[1fr_auto]">
          <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="搜尋課程編號、園所、課程或老師" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <button disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="rounded-lg border border-slate-200 bg-white px-3 py-2 disabled:opacity-40">上一頁</button>
            <span>第 {page} / {totalPages} 頁</span>
            <button disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} className="rounded-lg border border-slate-200 bg-white px-3 py-2 disabled:opacity-40">下一頁</button>
          </div>
        </div>
        <div className="grid gap-3 border-b border-slate-100 p-4 md:grid-cols-5">
          <select value={filterDepartment} onChange={(e) => { setFilterDepartment(e.target.value); setPage(1); }} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
            <option value="">全部類型</option>
            {DEPARTMENTS.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <select value={filterTeacher} onChange={(e) => { setFilterTeacher(e.target.value); setPage(1); }} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
            <option value="">全部老師</option>
            <option value="unassigned">未指派 / 待排老師</option>
            {teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}
          </select>
          <select value={filterMonth} onChange={(e) => { setFilterMonth(e.target.value); setPage(1); }} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
            <option value="">全部月份</option>
            <option value="7">7月</option>
            <option value="8">8月</option>
          </select>
          <input type="number" value={filterYear} onChange={(e) => { setFilterYear(Number(e.target.value) || new Date().getFullYear()); setPage(1); }} className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
          {(filterDepartment || filterTeacher || filterMonth) && (
            <button type="button" onClick={() => { setFilterDepartment(""); setFilterTeacher(""); setFilterMonth(""); setPage(1); }}
              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100">
              清除類型/老師/月篩選
            </button>
          )}
        </div>
        <div className="p-4 border-b border-slate-100 flex gap-2 overflow-x-auto md:flex-wrap">
          <button onClick={() => { setFilterRegion(""); setPage(1); }} className={`shrink-0 px-3 py-2 md:py-1 rounded-full text-xs border ${!filterRegion ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600"}`}>全部</button>
          {regions.map((r) => <button key={r} onClick={() => { setFilterRegion(r); setPage(1); }} className={`shrink-0 px-3 py-2 md:py-1 rounded-full text-xs border ${filterRegion === r ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600"}`}>{r}</button>)}
          <span className="shrink-0 text-sm text-slate-500 self-center ml-2">本頁 {filtered.length} 門</span>
        </div>
        <div className="divide-y divide-slate-100 md:hidden">
          {filtered.map((c) => (
            <div key={c.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-slate-900">{c.school}</span>
                    <span className="font-mono text-xs text-slate-400">{c.code}</span>
                  </div>
                  <div className="mt-1 text-sm text-slate-600">{courseLabel(c.courseType)} · 主教 {displayTeacherName(c.teacher.name)}</div>
                  {c.assistantTeacher && <div className="mt-1 text-xs text-blue-600">助教 {c.assistantTeacher.name}</div>}
                  <div className="mt-1 text-xs text-slate-500">{c.dayOfWeek}{c.time ? ` · ${c.time}` : ""}{c.payrollHours ? ` · 計薪 ${c.payrollHours}h` : ""}</div>
                  {(c.scheduledDates?.length ?? 0) > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {c.scheduledDates!.slice(0, 4).map((d) => (
                        <span key={d} className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] text-amber-700">{formatMonthDay(d)}</span>
                      ))}
                      {c.scheduledDates!.length > 4 && <span className="text-[11px] text-slate-400">+{c.scheduledDates!.length - 4}</span>}
                    </div>
                  )}
                </div>
                <span className={`shrink-0 rounded-full px-2 py-1 text-xs font-medium ${c.isActive ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"}`}>{c.isActive ? "開課" : "停課"}</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                {normalizeRegion(c.region) && <span className="rounded-full bg-blue-50 px-2 py-1 text-blue-600">{normalizeRegion(c.region)}</span>}
                <span className={`rounded-full px-2 py-1 font-medium ${CATEGORY_BADGE_CLASS[normalizeCategory(c.category)]}`}>{normalizeCategory(c.category)}</span>
                {c.enrollCount && <span className="rounded-full bg-slate-50 px-2 py-1 text-slate-500">{c.enrollCount}</span>}
              </div>
              {c.address && <div className="mt-3 text-xs leading-5 text-slate-500">{c.address}</div>}
              <div className="mt-4 flex gap-4">
                <button onClick={() => edit(c)} className="text-sm font-medium text-blue-600 hover:text-blue-800">編輯</button>
                <button onClick={() => del(c.id, c.code)} className="text-sm font-medium text-red-500 hover:text-red-700">刪除</button>
              </div>
            </div>
          ))}
          {filtered.length === 0 && <div className="py-8 text-center text-slate-400">尚無課程資料</div>}
        </div>
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[1220px] text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="w-24 px-4 py-3 text-left font-semibold">編號</th>
                <th className="w-24 px-4 py-3 text-left font-semibold">地區</th>
                <th className="w-40 px-4 py-3 text-left font-semibold">學校</th>
                <th className="w-32 px-4 py-3 text-left font-semibold">老師</th>
                <th className="w-36 px-4 py-3 text-left font-semibold">項目</th>
                <th className="w-28 px-4 py-3 text-left font-semibold">星期</th>
                <th className="w-32 px-4 py-3 text-left font-semibold">時間</th>
                <th className="w-24 px-4 py-3 text-left font-semibold">計薪</th>
                <th className="min-w-64 px-4 py-3 text-left font-semibold">地址</th>
                <th className="w-24 px-4 py-3 text-left font-semibold">類別</th>
                <th className="w-28 px-4 py-3 text-left font-semibold">報名人數</th>
                <th className="w-20 px-4 py-3 text-left font-semibold">狀態</th>
                <th className="w-28 px-4 py-3 text-left font-semibold">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50/70">
                  <td className="px-4 py-3 font-mono text-xs text-slate-500 whitespace-nowrap">{c.code}</td>
                  <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{normalizeRegion(c.region)}</td>
                  <td className="px-4 py-3 font-medium text-slate-900">{c.school}</td>
                  <td className="px-4 py-3 text-slate-700 whitespace-nowrap">
                    <div>主教：{displayTeacherName(c.teacher.name)}</div>
                    {c.assistantTeacher && <div className="mt-1 inline-flex rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-600">助教：{c.assistantTeacher.name}</div>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 whitespace-nowrap">
                      <span className="font-medium text-slate-900">{courseLabel(c.courseType)}</span>
                      {courseLabel(c.courseType) !== c.courseType && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">{c.courseType}</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">
                    <div>{c.dayOfWeek}</div>
                    {(c.scheduledDates?.length ?? 0) > 0 && (
                      <div className="mt-1 flex max-w-[150px] flex-wrap gap-1 whitespace-normal">
                        {c.scheduledDates!.slice(0, 3).map((d) => (
                          <span key={d} className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-700">{formatMonthDay(d)}</span>
                        ))}
                        {c.scheduledDates!.length > 3 && <span className="text-[10px] text-slate-400">+{c.scheduledDates!.length - 3}</span>}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-700 whitespace-nowrap">{c.time || "—"}</td>
                  <td className="px-4 py-3 text-xs text-slate-700 whitespace-nowrap">{c.payrollHours ? `${c.payrollHours}h` : "自動估算"}</td>
                  <td className="px-4 py-3 text-xs leading-5 text-slate-500 whitespace-normal break-words">{c.address || "—"}</td>
                  <td className="px-4 py-3"><span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${CATEGORY_BADGE_CLASS[normalizeCategory(c.category)]}`}>{normalizeCategory(c.category)}</span></td>
                  <td className="px-4 py-3 text-sm text-slate-700 whitespace-nowrap">{c.enrollCount || "—"}</td>
                  <td className="px-4 py-3"><span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${c.isActive ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"}`}>{c.isActive ? "開課" : "停課"}</span></td>
                  <td className="px-4 py-3">
                    <div className="flex gap-3 whitespace-nowrap">
                      <button onClick={() => edit(c)} className="text-blue-600 hover:text-blue-800 text-sm font-medium">編輯</button>
                      <button onClick={() => del(c.id, c.code)} className="text-red-500 hover:text-red-700 text-sm font-medium">刪除</button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={13} className="text-center text-slate-400 py-8">尚無課程資料</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
