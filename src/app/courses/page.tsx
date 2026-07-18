"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { SaveButton } from "@/components/SaveButton";
import { SearchableSelect } from "@/components/SearchableSelect";
import { TeacherCombobox } from "@/components/TeacherCombobox";
import { Toast } from "@/components/Toast";
import { useDepartment, DEPARTMENTS } from "@/lib/departmentContext";
import { expandIsoDateRange, expandWeeklyDates, formatMonthDay, parseCourseDateInput, weekdayOfIso } from "@/lib/courseDates";
import { CATEGORY_BADGE_CLASS, CATEGORY_OPTIONS, COURSE_OPTIONS, courseLabel, normalizeCategory, normalizeDepartment, normalizeRegion, REGION_OPTIONS } from "@/lib/courseMeta";
import { useScrollToFormOnEdit } from "@/lib/useScrollToFormOnEdit";
import { useToast } from "@/lib/useToast";

type Teacher = {
  id: number;
  name: string;
  teachingProfile?: {
    primaryRegionLabel: string;
    primarySpecialtyLabel: string;
    primaryCourseTypes: string[];
  };
};
type School = { id: number; name: string; type: string; region: string; address: string };
type CourseOption = { code: string; label: string };
type Course = {
  id: number; code: string; region: string; teacher: Teacher; teacherId: number; assistantTeacher?: Teacher | null; assistantTeacherId?: number | null;
  school: string; schoolId: number | null; courseType: string; address: string; dayOfWeek: string; time: string; payrollHours: number | null;
  category: string; department: string; enrollCount: string; isActive: boolean; notes: string;
  academicTermOverride?: string;
  courseConfirmationSummary?: string;
  recurrenceType?: string; startDate?: string | null; endDate?: string | null; weekday?: string;
  scheduledDates?: string[];
};
type PageResult<T> = { items: T[]; total: number; page: number; pageSize: number };

type DeptOption = (typeof DEPARTMENTS)[number];

function coerceDept(s: string): DeptOption {
  return normalizeDepartment(s) as DeptOption;
}

const DAYS = ["星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
const COURSE_WEEKDAY_SET = new Set(DAYS);
const DATE_MODES = [
  { value: "single", label: "單日" },
  { value: "multiple", label: "多日指定" },
  { value: "range", label: "日期區間" },
  { value: "weekly", label: "每週循環" },
] as const;

const EMPTY_FORM = {
  code: "", region: "", teacherId: 0, assistantTeacherId: null as number | null, school: "", schoolId: null as number | null,
  courseType: "", address: "", dayOfWeek: "星期一", time: "", payrollHours: "", category: "課後", department: "幼兒園" as DeptOption, enrollCount: "", isActive: true, notes: "", academicTermOverride: "",
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
  if (form.dateMode === "weekly") return expandWeeklyDates(form.recurringStart, form.recurringEnd, form.recurringDays.filter((day) => COURSE_WEEKDAY_SET.has(day)));

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

function displayTeacherOption(teacher: Teacher) {
  const profile = teacher.teachingProfile;
  const courses = profile?.primaryCourseTypes?.length ? profile.primaryCourseTypes.join("、") : "授課項目整理中";
  const region = profile?.primaryRegionLabel?.replace(/老師$/, "") || "主要地區整理中";
  return `${displayTeacherName(teacher.name)}｜${courses}｜${region}`;
}

function uniqueSortedDates(dates: string[]) {
  return [...new Set(dates.map((d) => d.slice(0, 10)).filter(Boolean))].sort();
}

function courseDateSummary(dates?: string[]) {
  const unique = uniqueSortedDates(dates ?? []);
  if (unique.length === 0) return "—";
  return `${unique.slice(0, 6).map(formatMonthDay).join("、")}${unique.length > 6 ? ` 等 ${unique.length} 天` : ""}`;
}

function academicTermOfDate(iso?: string) {
  if (!iso) return "未設定學期";
  const [year, month] = iso.slice(0, 10).split("-").map(Number);
  if (!year || !month) return "未設定學期";
  return month >= 9 ? `${year - 1911}-1` : `${year - 1912}-2`;
}

function courseTerm(c: Course) {
  if (c.academicTermOverride) return c.academicTermOverride;
  const dates = uniqueSortedDates(c.scheduledDates ?? []);
  const firstDate = dates[0] || c.startDate?.slice(0, 10) || undefined;
  if (normalizeDepartment(c.department).includes("安親")) {
    const year = Number(firstDate?.slice(0, 4));
    return year ? `${year - 1911} 暑假` : "暑假課程";
  }
  return academicTermOfDate(firstDate);
}

function courseEnded(c: Course) {
  const dates = uniqueSortedDates(c.scheduledDates ?? []);
  const end = dates.at(-1) || c.endDate?.slice(0, 10) || "";
  return Boolean(end && end < new Date().toISOString().slice(0, 10));
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
    days: weekdays.filter((day) => COURSE_WEEKDAY_SET.has(day)),
  };
}

function sanitizeCourseWeekdays(days: string[]) {
  return [...new Set(days.filter((day) => COURSE_WEEKDAY_SET.has(day)))];
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
  const [loadingCourses, setLoadingCourses] = useState(false);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState("");
  const [generatingCode, setGeneratingCode] = useState(false);
  const [showCourseOptionForm, setShowCourseOptionForm] = useState(false);
  const [newCourseOption, setNewCourseOption] = useState("");
  const [savingCourseOption, setSavingCourseOption] = useState(false);
  const { toast, showToast } = useToast();
  const showToastRef = useRef(showToast);
  const formRef = useRef<HTMLDivElement | null>(null);
  const firstInputRef = useRef<HTMLInputElement | null>(null);
  const scrollToFormOnEdit = useScrollToFormOnEdit(formRef, firstInputRef);

  useEffect(() => { showToastRef.current = showToast; }, [showToast]);

  const loadCourses = useCallback(
    async () => {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
        includeDates: "1",
        includeConfirmation: "0",
      });
      const effectiveDept = filterDepartment || dept;
      if (effectiveDept) params.set("dept", effectiveDept);
      if (filterRegion) params.set("region", filterRegion);
      if (filterTeacher) params.set("teacher", filterTeacher);
      if (filterMonth) {
        params.set("month", filterMonth);
        params.set("year", String(filterYear));
      }
      if (search.trim()) params.set("search", search.trim());
      setLoadingCourses(true);
      try {
        const res = await fetch(`/api/courses?${params}`, { cache: "no-store" });
        if (!res.ok) throw new Error(await readErrorMessage(res, "課程資料載入失敗"));
        const data = await res.json() as PageResult<Course>;
        setCourses(Array.isArray(data.items) ? data.items : []);
        setTotal(Number(data.total) || 0);
      } catch (e) {
        showToastRef.current("error", (e as Error).message || "課程資料載入失敗", 3000);
      } finally {
        setLoadingCourses(false);
      }
    },
    [dept, filterDepartment, filterMonth, filterRegion, filterTeacher, filterYear, page, search],
  );

  const loadOptions = useCallback(async () => {
    setLoadingOptions(true);
    try {
      const [teacherRes, schoolRes, optionRes] = await Promise.all([
        fetch("/api/teachers", { cache: "no-store" }),
        fetch("/api/schools?minimal=1", { cache: "no-store" }),
        fetch("/api/course-options", { cache: "no-store" }),
      ]);
      const errors = await Promise.all([
        teacherRes.ok ? Promise.resolve("") : readErrorMessage(teacherRes, "老師清單載入失敗"),
        schoolRes.ok ? Promise.resolve("") : readErrorMessage(schoolRes, "園所清單載入失敗"),
        optionRes.ok ? Promise.resolve("") : readErrorMessage(optionRes, "課程選項載入失敗"),
      ]);
      const firstError = errors.find(Boolean);
      if (firstError) throw new Error(firstError);

      const [teacherData, schoolData, optionData] = await Promise.all([
        teacherRes.json(),
        schoolRes.json(),
        optionRes.json(),
      ]);
      setTeachers(Array.isArray(teacherData) ? teacherData : []);
      setSchools(Array.isArray(schoolData) ? schoolData : []);
      setCourseOptions(Array.isArray(optionData) ? optionData : COURSE_OPTIONS.map((option) => ({ ...option })));
    } catch (e) {
      showToastRef.current("error", (e as Error).message || "課程選項載入失敗", 3000);
    } finally {
      setLoadingOptions(false);
    }
  }, []);

  useEffect(() => { queueMicrotask(() => { void loadCourses(); }); }, [loadCourses]);
  useEffect(() => { queueMicrotask(() => { void loadOptions(); }); }, [loadOptions]);
  useEffect(() => {
    queueMicrotask(() => {
      setFilterDepartment(dept || "");
      setPage(1);
    });
  }, [dept]);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const queryDept = params.get("dept");
    const queryTeacher = params.get("teacher");
    const queryMonth = params.get("month");
    const queryYear = params.get("year");
    queueMicrotask(() => {
      if (queryDept) setFilterDepartment(queryDept);
      if (queryTeacher) setFilterTeacher(queryTeacher);
      if (queryMonth) setFilterMonth(queryMonth);
      if (queryYear) setFilterYear(Number(queryYear) || new Date().getFullYear());
    });
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
    setSaveStatus(scheduledDates.length > 0 ? `正在儲存課程與 ${scheduledDates.length} 筆上課日期…` : "正在儲存課程…");
    try {
      let res: Response;
      if (editing !== null) {
        setSaveStatus("正在更新課程與未來出勤紀錄…");
        res = await fetch(`/api/courses/${editing}`, { method: "PUT", headers, body });
      } else {
        setSaveStatus("正在建立課程與出勤紀錄…");
        res = await fetch("/api/courses", { method: "POST", headers, body });
      }
      if (!res.ok) {
        const message = await readErrorMessage(res, "課程儲存失敗");
        if (message.includes("登入狀態")) window.location.href = "/login";
        throw new Error(message);
      }
      const result = await res.json().catch(() => ({}));
      const wasAfterSchool = form.department === "安親班";
      setForm({ ...EMPTY_FORM, department: coerceDept(dept || "幼兒園") }); setEditing(null); setShowForm(false); void loadCourses();
      const warnings = Array.isArray(result.warnings) ? result.warnings.filter(Boolean) : [];
      const baseMsg = warnings.length > 0 ? `課程已儲存，但${warnings[0]}` : "課程已儲存";
      const afterSchoolHint = wasAfterSchool ? "｜請至「出勤紀錄」設定每天老師" : "";
      showToast("success", baseMsg + afterSchoolHint, warnings.length > 0 || wasAfterSchool ? 5000 : 2500);
    } catch (e) {
      showToast("error", (e as Error).message || "課程儲存失敗", 3500);
    } finally {
      setSaving(false);
      setSaveStatus("");
    }
  };

  const del = async (id: number, code: string) => {
    if (!confirm(`確定刪除課程「${code}」？（已有出勤紀錄的課程無法刪除，請改用「停用」）`)) return;
    const res = await fetch(`/api/courses/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const message = await readErrorMessage(res, "刪除失敗，請確認是否仍有關聯資料");
      alert(message);
      if (message.includes("登入狀態")) window.location.href = "/login";
      return;
    }
    void loadCourses();
  };

  const edit = async (c: Course) => {
    // Fetch full course with scheduledDates on demand (edit form needs all saved dates)
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
    const recurrenceDays = sanitizeCourseWeekdays(fullCourse.weekday?.split(",").filter(Boolean) || inferredWeekly?.days || [fullCourse.dayOfWeek || "星期一"]);
    setForm({ code: fullCourse.code, region: normalizeRegion(fullCourse.region), teacherId: fullCourse.teacherId, assistantTeacherId: fullCourse.assistantTeacherId ?? null, school: fullCourse.school, schoolId: fullCourse.schoolId,
      courseType: fullCourse.courseType, address: fullCourse.address || "", dayOfWeek: fullCourse.dayOfWeek, time: fullCourse.time, payrollHours: fullCourse.payrollHours == null ? "" : String(fullCourse.payrollHours), category: normalizeCategory(fullCourse.category),
      department: coerceDept(fullCourse.department || "幼兒園"), enrollCount: fullCourse.enrollCount, isActive: fullCourse.isActive, notes: fullCourse.notes.replace(/\s*\[\[TERM:[^\]]+\]\]\s*/g, " ").trim(), academicTermOverride: fullCourse.academicTermOverride ?? "",
      dateMode, scheduledDateText: "", scheduledDateYear: existingDates[0] ? Number(existingDates[0].slice(0, 4)) : new Date().getFullYear(), scheduledDates: dateMode === "weekly" ? [] : existingDates,
      rangeStart: dateMode === "range" ? recurrenceStart : "", rangeEnd: dateMode === "range" ? recurrenceEnd : "",
      recurringStart: dateMode === "weekly" ? recurrenceStart : "", recurringEnd: dateMode === "weekly" ? recurrenceEnd : "", recurringDays: recurrenceDays.length > 0 ? recurrenceDays : ["星期一"] });
    setEditing(c.id); setShowForm(true);
    scrollToFormOnEdit();
  };

  const regions = [...new Set([...REGION_OPTIONS, ...schools.map((s) => normalizeRegion(s.region)).filter(Boolean)])].sort();
  const schoolCourseNames = new Map<string, Set<string>>();
  for (const course of courses) {
    if (!course.school && !course.schoolId) continue;
    const keys = [course.schoolId ? String(course.schoolId) : "", course.school].filter(Boolean);
    for (const key of keys) {
      const set = schoolCourseNames.get(key) ?? new Set<string>();
      set.add(courseLabel(course.courseType));
      schoolCourseNames.set(key, set);
    }
  }
  const schoolOptions = schools.map((school) => {
    const courseNames = [
      ...(schoolCourseNames.get(String(school.id)) ?? new Set<string>()),
      ...(schoolCourseNames.get(school.name) ?? new Set<string>()),
    ].filter(Boolean);
    const courseText = [...new Set(courseNames)].join("、") || normalizeDepartment(school.type) || "課程整理中";
    const region = normalizeRegion(school.region) || "未填地區";
    return {
      value: school.id,
      label: `${school.name}｜${region}｜${courseText}`,
      searchText: `${school.name} ${region} ${school.address} ${school.type} ${courseText}`,
    };
  });
  const courseSelectOptions = [
    ...courseOptions.map((option) => ({
      value: option.code,
      label: `${option.label}${option.label !== option.code ? `｜${option.code}` : ""}`,
      searchText: `${option.label} ${option.code}`,
    })),
    ...(form.courseType && !courseOptions.some((option) => option.code === form.courseType)
      ? [{ value: form.courseType, label: `${courseLabel(form.courseType)}｜既有資料`, searchText: form.courseType }]
      : []),
  ];
  const teacherFilterOptions = [
    { value: "unassigned", label: "未指派 / 待排老師", searchText: "未指派 待排老師" },
    ...teachers.map((teacher) => ({
      value: String(teacher.id),
      label: displayTeacherOption(teacher),
      searchText: `${teacher.name} ${displayTeacherOption(teacher)}`,
    })),
  ];
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
          <p className="text-sm text-slate-500">
            {loadingCourses ? "課程載入中…" : `共 ${total} 門課程，目前顯示 ${courses.length} 門`}
            {loadingOptions && <span className="ml-2 text-xs text-slate-400">老師/園所選項載入中</span>}
          </p>
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
              <SearchableSelect
                options={schoolOptions}
                value={form.schoolId ?? ""}
                onChange={(value) => {
                  if (value == null) setForm((current) => ({ ...current, schoolId: null }));
                  else selectSchool(Number(value));
                }}
                placeholder={loadingOptions ? "園所載入中…" : "搜尋園所名稱、地區、地址"}
                emptyText="查無符合的園所，請確認關鍵字"
                emptyLabel="手動輸入園所"
              />
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
              <TeacherCombobox
                teachers={teachers}
                value={form.teacherId || null}
                onChange={(teacherId) => setForm({ ...form, teacherId: teacherId ?? 0 })}
                placeholder="-- 選擇老師 --"
                displayName={displayTeacherOption}
              />
              {form.department === "安親班" && (
                <p className="mt-1 text-xs text-amber-600">安親班每天老師請在「出勤紀錄」逐日設定。此欄選「待排老師」即可。</p>
              )}
            </div>
            {form.department !== "安親班" && (
              <div>
                <label>助教老師（選填）</label>
                <TeacherCombobox
                  teachers={teachers}
                  value={form.assistantTeacherId}
                  onChange={(teacherId) => setForm({ ...form, assistantTeacherId: teacherId })}
                  placeholder="-- 無助教 --"
                  allowEmpty
                  emptyLabel="-- 無助教 --"
                  excludeTeacherId={form.teacherId}
                  className="bg-blue-50/40"
                  displayName={displayTeacherOption}
                />
                <p className="mt-1 text-xs text-blue-500">選填，會同步到出勤與助教薪資。</p>
              </div>
            )}
            <div>
              <label>課程項目</label>
              <SearchableSelect
                options={courseSelectOptions}
                value={form.courseType}
                onChange={(value) => setForm({ ...form, courseType: value ?? "" })}
                placeholder="搜尋課程名稱或編號"
                emptyText="查無符合的課程，請確認關鍵字"
                emptyLabel="清除課程"
              />
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
              <label>課程期別</label>
              <select value={form.academicTermOverride} onChange={(e) => setForm({ ...form, academicTermOverride: e.target.value })}>
                <option value="">自動依上課日期判斷</option>
                <option value="114-2">114-2</option>
                <option value="115-1">115-1</option>
                <option value="115 暑假">115 暑假</option>
              </select>
              <p className="mt-1 text-xs text-slate-500">手動選擇會優先於系統判斷。</p>
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
                        recurringDays: sanitizeCourseWeekdays(f.recurringDays).length > 0
                          ? sanitizeCourseWeekdays(f.recurringDays)
                          : sanitizeCourseWeekdays(inferred?.days ?? [f.dayOfWeek || "星期一"]),
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
                            const next = e.target.checked ? [...sanitizeCourseWeekdays(form.recurringDays), d] : form.recurringDays.filter((x) => x !== d);
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
            <SaveButton saving={saving} onClick={save} savingText="儲存中，請稍候…" />
            <button disabled={saving} onClick={() => { setShowForm(false); setEditing(null); }} className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium px-4 py-2 rounded-lg text-sm disabled:cursor-not-allowed disabled:opacity-60">取消</button>
          </div>
          {saveStatus && <p className="mt-2 text-sm font-medium text-blue-700">{saveStatus}</p>}
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
          <SearchableSelect
            options={teacherFilterOptions}
            value={filterTeacher}
            onChange={(value) => { setFilterTeacher(value ?? ""); setPage(1); }}
            placeholder={loadingOptions ? "老師載入中…" : "搜尋老師、授課項目或地區"}
            emptyLabel="全部老師"
            emptyText="查無符合的老師，請確認關鍵字"
          />
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
                  <div className="mt-1 text-xs font-medium text-amber-700">日期：{courseDateSummary(c.scheduledDates)}</div>
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
              </div>
              {c.address && <div className="mt-3 text-xs leading-5 text-slate-500">{c.address}</div>}
              <div className="mt-4"><CourseActions course={c} onEdit={edit} onDelete={del} /></div>
            </div>
          ))}
          {filtered.length === 0 && <div className="py-8 text-center text-slate-400">{loadingCourses ? "課程載入中…" : "尚無課程資料"}</div>}
        </div>
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[1200px] text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="w-24 px-4 py-3 text-left font-semibold">編號</th>
                <th className="w-24 px-4 py-3 text-left font-semibold">地區</th>
                <th className="w-40 px-4 py-3 text-left font-semibold">學校</th>
                <th className="w-32 px-4 py-3 text-left font-semibold">老師</th>
                <th className="w-36 px-4 py-3 text-left font-semibold">項目</th>
                <th className="w-44 px-4 py-3 text-left font-semibold">日期</th>
                <th className="w-28 px-4 py-3 text-left font-semibold">星期</th>
                <th className="w-32 px-4 py-3 text-left font-semibold">時間</th>
                <th className="w-24 px-4 py-3 text-left font-semibold">計薪</th>
                <th className="min-w-64 px-4 py-3 text-left font-semibold">地址</th>
                <th className="w-24 px-4 py-3 text-left font-semibold">類別</th>
                <th className="w-20 px-4 py-3 text-left font-semibold">狀態</th>
                <th className="w-28 px-4 py-3 text-left font-semibold">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50/70">
                  <td className="px-4 py-3 font-mono text-xs text-slate-500 whitespace-nowrap"><div>{c.code}</div><span className="mt-1 inline-flex rounded-full bg-indigo-50 px-2 py-0.5 font-sans text-[10px] font-bold text-indigo-700">{courseTerm(c)}</span></td>
                  <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{normalizeRegion(c.region)}</td>
                  <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-900">{c.school}</td>
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
                  <td className="px-4 py-3 text-xs font-medium leading-5 text-amber-700 whitespace-normal">{courseDateSummary(c.scheduledDates)}</td>
                  <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">
                    {c.dayOfWeek}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-700 whitespace-nowrap">{c.time || "—"}</td>
                  <td className="px-4 py-3 text-xs text-slate-700 whitespace-nowrap">{c.payrollHours ? `${c.payrollHours}h` : "自動估算"}</td>
                  <td className="px-4 py-3 text-xs leading-5 text-slate-500 whitespace-normal break-words">{c.address || "—"}</td>
                  <td className="px-4 py-3"><span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${CATEGORY_BADGE_CLASS[normalizeCategory(c.category)]}`}>{normalizeCategory(c.category)}</span></td>
                  <td className="px-4 py-3"><span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${c.isActive && !courseEnded(c) ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"}`}>{!c.isActive ? "停課" : courseEnded(c) ? "學期結束" : "開課"}</span></td>
                  <td className="px-4 py-3">
                    <CourseActions course={c} onEdit={edit} onDelete={del} />
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={13} className="text-center text-slate-400 py-8">{loadingCourses ? "課程載入中…" : "尚無課程資料"}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function CourseActions({ course, onEdit, onDelete }: { course: Course; onEdit: (course: Course) => void; onDelete: (id: number, code: string) => void }) {
  const closeAndRun = (event: React.MouseEvent<HTMLButtonElement>, action: () => void) => {
    const menu = event.currentTarget.closest("details");
    if (menu) menu.open = false;
    action();
  };
  const itemClass = "block w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-50";
  return (
    <details className="relative inline-block text-left">
      <summary className="flex min-h-9 cursor-pointer list-none items-center gap-1 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50">
        操作 <span className="text-slate-400" aria-hidden="true">▾</span>
      </summary>
      <div className="absolute right-0 z-30 mt-1 w-44 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
        <button onClick={(event) => closeAndRun(event, () => onEdit(course))} className={itemClass}>編輯課程</button>
        <Link href={`/course-change-requests?courseId=${course.id}`} className={itemClass}>申請課程異動</Link>
        <div className="my-1 border-t border-slate-100" />
        <button onClick={(event) => closeAndRun(event, () => onDelete(course.id, course.code))} className={`${itemClass} text-red-600 hover:bg-red-50`}>刪除課程</button>
      </div>
    </details>
  );
}
