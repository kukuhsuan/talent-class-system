"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { SaveButton } from "@/components/SaveButton";
import { SearchableSelect } from "@/components/SearchableSelect";
import { TeacherCombobox } from "@/components/TeacherCombobox";
import { Toast } from "@/components/Toast";
import { ensureOk, readApiError } from "@/lib/clientApi";
import { useDepartment } from "@/lib/departmentContext";
import { CATEGORY_OPTIONS, courseLabel, normalizeCategory, requiresStudentCount } from "@/lib/courseMeta";
import { EQUIPMENT_STATUSES, equipmentSummaryLabels, hasEquipmentSettings, type EquipmentReminderData } from "@/lib/equipmentReminderCore";
import { coursePayrollHoursForAttendance } from "@/lib/payrollHoursCore";
import { taipeiDateIso } from "@/lib/courseDates";
import { useScrollToFormOnEdit } from "@/lib/useScrollToFormOnEdit";
import { useToast } from "@/lib/useToast";

type Teacher = { id: number; name: string };
type Course = { id: number; code: string; school: string; courseType: string; time: string; payrollHours?: number | null; teacher: Teacher; teacherId: number; assistantTeacher?: Teacher | null; assistantTeacherId?: number | null; category: string };
type Attendance = {
  id: number; date: string; course: Course; actualTeacher: Teacher; assistantTeacher?: Teacher | null; assistantTeacherId?: number | null;
  studentCount: number | null; cancelled: boolean; cancelReason: string; makeupDate: string | null; makeupDone: boolean;
  category: string; hours: number; notes: string; scheduledTime?: string; reportContent?: string;
  substitutes?: Array<{ role: string }>;
  reportFillable?: boolean; reportExpired?: boolean; reportFillStatus?: string; missingItems?: string[]; pendingReport?: boolean; hoursNeedsReview?: boolean; hoursReviewReason?: string;
  equipment?: (EquipmentReminderData & { attendanceId: number }) | null;
  expectedStudentCount?: number | null;
  schoolVerifierName?: string;
  schoolSignatureData?: string;
  schoolSignedAt?: string | null;
};
type PageResult<T> = { items: T[]; total: number; page: number; pageSize: number };

const today = () => taipeiDateIso();
const initialStatusFilter = () => {
  if (typeof window === "undefined") return "all";
  const status = new URLSearchParams(window.location.search).get("status");
  return ["all", "missing", "done", "substitute", "cancelled"].includes(status ?? "") ? status ?? "all" : "all";
};
const EMPTY_EQUIPMENT: EquipmentReminderData = {
  isFirstClass: false, needsAssembly: false, equipmentNote: "",
  needsTransferAfterClass: false, nextSchoolName: "", nextClassDate: "", nextCourseType: "", nextAddress: "", transferNote: "",
  status: "待確認",
};
const EMPTY_FORM = {
  date: today(), courseId: 0, actualTeacherId: 0, assistantTeacherId: null as number | null,
  studentCount: "", cancelled: false, cancelReason: "", makeupDate: "", makeupDone: false, category: "課後", hours: 0, notes: "",
  scheduledTime: "", confirmCompleted: false, extraDates: [] as string[],
  equipment: EMPTY_EQUIPMENT,
  expectedStudentCount: "",
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
  const [statusFilter, setStatusFilter] = useState(initialStatusFilter);
  const [filterSchool, setFilterSchool] = useState("");
  const [filterTeacher, setFilterTeacher] = useState("");
  const [filterDate, setFilterDate] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 80;
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const { toast, showToast } = useToast();
  const showToastRef = useRef(showToast);
  const formRef = useRef<HTMLDivElement | null>(null);
  const firstInputRef = useRef<HTMLInputElement | null>(null);
  const scrollToFormOnEdit = useScrollToFormOnEdit(formRef, firstInputRef);

  useEffect(() => { showToastRef.current = showToast; }, [showToast]);

  const loadRecords = useCallback(async () => {
    const params = new URLSearchParams({ year: String(filterYear), month: String(filterMonth), page: String(page), pageSize: String(pageSize) });
    if (dept) params.set("dept", dept);
    if (filterSchool) params.set("school", filterSchool);
    if (filterTeacher) params.set("teacherId", filterTeacher);
    if (filterDate) params.set("date", filterDate);
    if (filterCategory) params.set("category", filterCategory);
    if (statusFilter !== "all" && statusFilter !== "substitute") params.set("status", statusFilter);
    setLoadingRecords(true);
    try {
      const res = await fetch(`/api/attendance?${params}`, { cache: "no-store" });
      if (!res.ok) throw new Error(await readApiError(res, "出勤紀錄載入失敗"));
      const data = await res.json() as PageResult<Attendance>;
      setRecords(Array.isArray(data.items) ? data.items : []);
      setTotal(Number(data.total) || 0);
    } catch (error) {
      showToastRef.current("error", (error as Error).message || "出勤紀錄載入失敗", 3000);
    } finally {
      setLoadingRecords(false);
    }
  }, [filterYear, filterMonth, page, dept, filterSchool, filterTeacher, filterDate, filterCategory, statusFilter]);

  const loadOptions = useCallback(async () => {
    setLoadingOptions(true);
    try {
      // minimal=1：只抓下拉選單需要的欄位，避免載入整張課程表
      const courseParams = new URLSearchParams({ minimal: "1" });
      if (dept) courseParams.set("dept", dept);
      const [courseRes, teacherRes] = await Promise.all([
        fetch(`/api/courses?${courseParams}`, { cache: "no-store" }),
        fetch("/api/teachers?minimal=1", { cache: "no-store" }),
      ]);
      const courseError = courseRes.ok ? "" : await readApiError(courseRes, "課程清單載入失敗");
      const teacherError = teacherRes.ok ? "" : await readApiError(teacherRes, "老師清單載入失敗");
      if (courseError || teacherError) throw new Error(courseError || teacherError);
      const [courseData, teacherData] = await Promise.all([courseRes.json(), teacherRes.json()]);
      setCourses(Array.isArray(courseData) ? courseData : []);
      setTeachers(Array.isArray(teacherData) ? teacherData : []);
    } catch (error) {
      showToastRef.current("error", (error as Error).message || "篩選選項載入失敗", 3000);
    } finally {
      setLoadingOptions(false);
    }
  }, [dept]);

  useEffect(() => { queueMicrotask(() => { void loadRecords(); }); }, [loadRecords]);
  useEffect(() => { queueMicrotask(() => { void loadOptions(); }); }, [loadOptions]);

  const onCourseChange = (courseId: number) => {
    const c = courses.find((x) => x.id === courseId);
    const calculatedHours = coursePayrollHoursForAttendance(c?.payrollHours, c?.time ?? "");
    setForm((f) => ({
      ...f,
      courseId,
      category: normalizeCategory(c?.category),
      hours: calculatedHours.hours,
      ...(editing === null ? {
        actualTeacherId: c?.teacherId ?? 0,
        assistantTeacherId: c?.assistantTeacherId ?? null,
      } : {}),
    }));
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
      setForm(EMPTY_FORM); setEditing(null); setShowForm(false); void loadRecords();
    } catch (e) {
      showToast("error", (e as Error).message || "上課紀錄儲存失敗", 3000);
    } finally {
      setSaving(false);
    }
  };

  const del = async (id: number) => {
    if (!confirm("確定刪除此筆紀錄？")) return;
    await fetch(`/api/attendance/${id}`, { method: "DELETE" });
    void loadRecords();
  };

  const exportAttendance = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const params = new URLSearchParams({ year: String(filterYear), month: String(filterMonth) });
      if (dept) params.set("dept", dept);
      if (filterSchool) params.set("school", filterSchool);
      if (filterTeacher) params.set("teacherId", filterTeacher);
      if (filterDate) params.set("date", filterDate);
      if (filterCategory) params.set("category", filterCategory);
      if (statusFilter !== "all") params.set("status", statusFilter);
      const res = await fetch(`/api/export/attendance?${params}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `匯出失敗（${res.status}）`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `attendance-${filterYear}-${String(filterMonth).padStart(2, "0")}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      showToast("error", (error as Error).message || "匯出失敗", 4000);
    } finally {
      setExporting(false);
    }
  };

  const edit = (r: Attendance) => {
    setForm({ date: r.date.slice(0, 10), courseId: r.course.id, actualTeacherId: r.actualTeacher.id, assistantTeacherId: r.assistantTeacherId ?? r.course.assistantTeacherId ?? null, studentCount: r.studentCount?.toString() ?? "", cancelled: r.cancelled, cancelReason: r.cancelReason ?? "", makeupDate: r.makeupDate?.slice(0, 10) ?? "", makeupDone: r.makeupDone ?? false, category: normalizeCategory(r.category), hours: r.hours, notes: r.notes, scheduledTime: r.scheduledTime ?? "", confirmCompleted: Boolean(r.reportContent?.trim()), extraDates: [], expectedStudentCount: r.expectedStudentCount?.toString() ?? "", equipment: r.equipment ? { isFirstClass: Boolean(r.equipment.isFirstClass), needsAssembly: Boolean(r.equipment.needsAssembly), equipmentNote: r.equipment.equipmentNote ?? "", needsTransferAfterClass: Boolean(r.equipment.needsTransferAfterClass), nextSchoolName: r.equipment.nextSchoolName ?? "", nextClassDate: r.equipment.nextClassDate ?? "", nextCourseType: r.equipment.nextCourseType ?? "", nextAddress: r.equipment.nextAddress ?? "", transferNote: r.equipment.transferNote ?? "", status: r.equipment.status || "待確認" } : EMPTY_EQUIPMENT });
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
  const WAITING_TEACHER = "待排老師";
  const isCountRequired = (r: Attendance) => requiresStudentCount(r.category);
  const countDisplay = (r: Attendance) => r.studentCount ?? (isCountRequired(r) ? (r.pendingReport ? "待回報" : "未上課") : "免填");
  const isReportComplete = (r: Attendance) => {
    if (r.cancelled) return true;
    const hasReport = Boolean(r.reportContent?.trim());
    if (!isCountRequired(r)) return hasReport;
    // 課後課 / 營隊：人數 + 課程進度兩者都需要
    return r.studentCount !== null && hasReport;
  };
  const isMissingReport = (r: Attendance) => Boolean(r.pendingReport);
  const isSubstitute = (r: Attendance) => Boolean(r.substitutes?.some((record) => record.role === "主教"));
  const isUnassigned = (r: Attendance) => r.actualTeacher.name === WAITING_TEACHER;
  const statusLabel = (r: Attendance) => {
    if (r.cancelled) return "停課";
    if (!isCountRequired(r)) return isReportComplete(r) ? "出課完成" : "待確認出課";
    if (isReportComplete(r)) return "完成";
    if (!r.pendingReport) return "待上課";
    if (r.missingItems?.includes("缺課程進度")) return "缺課程進度";
    if (r.missingItems?.includes("缺出席人數")) return "缺出席人數";
    return "待回報";
  };
  const hoursDisplay = (r: Attendance) => r.hoursNeedsReview ? "需人工確認" : `${r.hours}h`;
  const setEquipment = (patch: Partial<EquipmentReminderData>) => setForm((f) => ({ ...f, equipment: { ...f.equipment, ...patch } }));
  // 器材標籤配色：無法協助紅、待處理黃、已完成綠、其餘藍
  const equipmentBadgeClass = (label: string) =>
    label === "無法協助" ? "bg-rose-100 text-rose-700 font-semibold"
      : label === "已確認器材" || label.startsWith("已完成") ? "bg-green-50 text-green-700"
        : label === "待確認" || label === "課後待轉送" ? "bg-amber-50 text-amber-700"
          : "bg-indigo-50 text-indigo-600";
  const equipmentLabels = (r: Attendance) => r.equipment ? equipmentSummaryLabels(r.equipment) : [];
  const filteredRecords = records.filter((r) => {
    if (statusFilter === "missing") return isMissingReport(r);
    if (statusFilter === "done") return isReportComplete(r);
    if (statusFilter === "substitute") return isSubstitute(r);
    if (statusFilter === "cancelled") return r.cancelled;
    if (statusFilter === "unassigned") return isUnassigned(r);
    return true;
  });
  const filteredByControls = records;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const courseSelectOptions = courses.map((course) => ({
    value: course.id,
    label: `${course.code}｜${course.school}｜${courseLabel(course.courseType)}｜${course.teacher.name}｜${course.time || "未填時間"}`,
    searchText: `${course.code} ${course.school} ${course.courseType} ${courseLabel(course.courseType)} ${course.teacher.name} ${course.time}`,
  }));
  const unassignedCount = filteredByControls.filter(isUnassigned).length;
  const statusTabs = [
    { key: "all", label: "全部", count: filteredByControls.length, className: "bg-blue-50 text-blue-700 border-blue-100" },
    { key: "missing", label: "待回報", count: filteredByControls.filter(isMissingReport).length, className: "bg-amber-50 text-amber-700 border-amber-100" },
    { key: "done", label: "已回報", count: filteredByControls.filter(isReportComplete).length, className: "bg-green-50 text-green-700 border-green-100" },
    { key: "substitute", label: "代課", count: filteredByControls.filter(isSubstitute).length, className: "bg-orange-50 text-orange-700 border-orange-100" },
    { key: "cancelled", label: "停課", count: filteredByControls.filter((r) => r.cancelled).length, className: "bg-red-50 text-red-700 border-red-100" },
    ...(unassignedCount > 0 ? [{ key: "unassigned", label: "⚠ 待指派老師", count: unassignedCount, className: "bg-rose-50 text-rose-700 border-rose-200" }] : []),
  ];
  const schoolOptions = [...new Set(courses.map((r) => r.school).filter(Boolean))].sort((a, b) => a.localeCompare(b, "zh-Hant"));
  const schoolFilterOptions = schoolOptions.map((school) => ({
    value: school,
    label: school,
    searchText: school,
  }));
  const teacherFilterOptions = teachers.map((teacher) => ({
    value: String(teacher.id),
    label: teacher.name,
    searchText: teacher.name,
  }));
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
  }, [])
    .map((group) => ({
      ...group,
      rows: group.rows.sort((a, b) => fmt(a.date).localeCompare(fmt(b.date)) || a.id - b.id),
    }))
    .sort((a, b) => a.school.localeCompare(b.school, "zh-Hant"));
  const toggleGroup = (school: string) => setExpandedGroups((groups) => ({ ...groups, [school]: !groups[school] }));

  return (
    <div>
      <Toast toast={toast} />
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-800">✏️ 上課紀錄</h1>
          <p className="text-sm text-slate-500">
            {loadingRecords ? "出勤紀錄載入中…" : `共 ${total} 筆，目前顯示 ${filteredRecords.length} 筆`}
            {loadingOptions && <span className="ml-2 text-xs text-slate-400">課程/老師選項載入中</span>}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={exportAttendance}
            disabled={exporting}
            className="bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white font-medium px-4 py-2 rounded-lg transition-colors text-sm"
          >
            {exporting ? "匯出中..." : "匯出 Excel"}
          </button>
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
              <SearchableSelect
                options={courseSelectOptions}
                value={form.courseId || ""}
                onChange={(value) => onCourseChange(value == null ? 0 : Number(value))}
                placeholder={loadingOptions ? "課程載入中…" : "搜尋課程編號、園所、課程或老師"}
                emptyText="查無符合的課程，請確認關鍵字"
                emptyLabel="清除課程"
              />
            </div>
            <div>
              <label>上課老師 *（代課時修改）</label>
              <TeacherCombobox
                teachers={teachers}
                value={form.actualTeacherId || null}
                onChange={(teacherId) => setForm({ ...form, actualTeacherId: teacherId ?? 0 })}
                placeholder="-- 選擇老師 --"
              />
            </div>
            <div>
              <label>助教老師（選填）</label>
              <TeacherCombobox
                teachers={teachers}
                value={form.assistantTeacherId}
                onChange={(teacherId) => setForm({ ...form, assistantTeacherId: teacherId })}
                placeholder="-- 無助教 --"
                allowEmpty
                emptyLabel="-- 無助教 --"
                excludeTeacherId={form.actualTeacherId}
              />
            </div>
            <div>
              <label>出席人數{requiresStudentCount(form.category) ? "" : "（課內免填）"}</label>
              <input type="number" value={form.studentCount} onChange={(e) => setForm({ ...form, studentCount: e.target.value })} placeholder={requiresStudentCount(form.category) ? "人數" : "固定班級免填"} />
            </div>
            <div>
              <label>預計人數（課前通知顯示）</label>
              <input type="number" value={form.expectedStudentCount} onChange={(e) => setForm({ ...form, expectedStudentCount: e.target.value })} placeholder="報名人數，選填" />
            </div>
            <div>
              <label>類別</label>
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {CATEGORY_OPTIONS.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label>計薪時數</label>
              <input type="number" step="0.01" value={form.hours} onChange={(e) => setForm({ ...form, hours: Number(e.target.value) })} />
            </div>
            <div>
              <label className="flex items-center gap-2 mt-6 cursor-pointer">
                <input type="checkbox" checked={form.cancelled} onChange={(e) => setForm({ ...form, cancelled: e.target.checked })} className="w-4 h-4" />
                <span className="text-sm font-medium text-slate-700">停課</span>
              </label>
            </div>
            {editing !== null && !requiresStudentCount(form.category) && !form.cancelled && (
              <div>
                <label className="flex items-center gap-2 mt-6 cursor-pointer">
                  <input type="checkbox" checked={form.confirmCompleted} onChange={(e) => setForm({ ...form, confirmCompleted: e.target.checked })} className="w-4 h-4" />
                  <span className="text-sm font-medium text-slate-700">確認已出課（後台人工確認）</span>
                </label>
              </div>
            )}
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
            <div>
              <label>每日上課時間（覆蓋課程預設）</label>
              <input value={form.scheduledTime} onChange={(e) => setForm({ ...form, scheduledTime: e.target.value })} placeholder={courses.find((c) => c.id === form.courseId)?.time ?? "例：14:00-15:00"} />
            </div>
            <div className="md:col-span-2">
              <label>備註</label>
              <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="備註" />
            </div>
            <div className="md:col-span-4 rounded-lg border border-indigo-100 bg-indigo-50/40 p-4">
              <div className="mb-3 flex flex-wrap items-center gap-4">
                <span className="text-sm font-semibold text-slate-700">📦 器材提醒（選填）</span>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.equipment.isFirstClass} onChange={(e) => setEquipment({ isFirstClass: e.target.checked })} className="w-4 h-4" />
                  <span className="text-sm text-slate-700">第一堂課（需確認器材送達）</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.equipment.needsAssembly} onChange={(e) => setEquipment({ needsAssembly: e.target.checked })} className="w-4 h-4" />
                  <span className="text-sm text-slate-700">需要組裝</span>
                </label>
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                <div className="md:col-span-2">
                  <label>器材內容</label>
                  <input value={form.equipment.equipmentNote} onChange={(e) => setEquipment({ equipmentNote: e.target.value })} placeholder="例：籃球架 2 座、球 20 顆" />
                </div>
                {editing !== null && hasEquipmentSettings(form.equipment) && (
                  <div>
                    <label>器材狀態</label>
                    <select value={form.equipment.status} onChange={(e) => setEquipment({ status: e.target.value })}>
                      {EQUIPMENT_STATUSES.map((s) => <option key={s}>{s}</option>)}
                    </select>
                  </div>
                )}
              </div>
              <p className="mt-2 text-xs text-slate-400">勾選後會在課前 LINE 提醒老師確認器材；全部留白代表清除此堂的器材提醒。</p>
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
          <SearchableSelect
            options={schoolFilterOptions}
            value={filterSchool}
            onChange={(value) => { setFilterSchool(value ?? ""); setPage(1); }}
            placeholder={loadingOptions ? "園所載入中…" : "搜尋園所"}
            emptyLabel="全部園所"
            emptyText="查無符合的園所，請確認關鍵字"
          />
          <SearchableSelect
            options={teacherFilterOptions}
            value={filterTeacher}
            onChange={(value) => { setFilterTeacher(value ?? ""); setPage(1); }}
            placeholder={loadingOptions ? "老師載入中…" : "搜尋老師"}
            emptyLabel="全部老師"
            emptyText="查無符合的老師，請確認關鍵字"
          />
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
                              <div className="mt-1 text-sm text-slate-600">{courseLabel(r.course.courseType)}｜{isUnassigned(r) ? <span className="font-semibold text-rose-600">⚠ 待指派老師</span> : `主教 ${r.actualTeacher.name}`}</div>
                              {!isUnassigned(r) && (r.assistantTeacher || r.course.assistantTeacher) && <div className="mt-1 text-xs text-blue-600">助教 {(r.assistantTeacher ?? r.course.assistantTeacher)?.name}</div>}
                            </div>
                            <span className={`rounded-full px-2 py-1 text-xs ${
                              r.cancelled ? "bg-red-100 text-red-600"
                              : statusLabel(r) === "缺課程進度" ? "bg-amber-100 text-amber-700 font-semibold"
                              : isReportComplete(r) ? "bg-green-100 text-green-600"
                              : "bg-slate-100 text-slate-500"
                            }`}>{statusLabel(r)}</span>
                          </div>
                          {isCountRequired(r) && r.reportFillStatus && <div className="mt-2 inline-flex rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">{r.reportFillStatus}</div>}
                          <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                            <div className="rounded-lg bg-slate-50 px-3 py-2"><div className="text-xs text-slate-400">人數</div><div className="font-medium">{countDisplay(r)}{r.expectedStudentCount != null && <span className="ml-1 text-xs font-normal text-blue-500">預計 {r.expectedStudentCount}</span>}</div></div>
                            <div className="rounded-lg bg-slate-50 px-3 py-2"><div className="text-xs text-slate-400">類別 / 計薪</div><div className="font-medium">{normalizeCategory(r.category)}｜{hoursDisplay(r)}</div></div>
                          </div>
                          {r.hoursNeedsReview && <div className="mt-2 text-xs font-medium text-amber-600">上課時間需人工確認{r.hoursReviewReason ? `：${r.hoursReviewReason}` : ""}</div>}
                          {equipmentLabels(r).length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1">
                              {equipmentLabels(r).map((label) => <span key={label} className={`rounded-full px-2 py-0.5 text-xs ${equipmentBadgeClass(label)}`}>📦 {label}</span>)}
                            </div>
                          )}
                          {substitute && <div className="mt-2 inline-flex rounded-full bg-orange-100 px-2 py-0.5 text-xs text-orange-700">代課</div>}
                          {(r.cancelReason || r.notes) && <div className="mt-2 text-xs text-slate-500">{r.cancelReason || r.notes}</div>}
                          <div className="mt-4 flex gap-4">
                            <button onClick={() => edit(r)} className="text-sm font-medium text-blue-600 hover:text-blue-800">編輯</button>
                            <Link href={`/course-change-requests?attendanceId=${r.id}`} className="text-sm font-medium text-cyan-700 hover:text-cyan-900">申請異動</Link>
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
                          <th className="px-4 py-3 text-center font-semibold">計薪時數</th>
                          <th className="px-4 py-3 text-left font-semibold">狀態</th>
                          <th className="px-4 py-3 text-left font-semibold">備註</th>
                          <th className="px-4 py-3 text-left font-semibold">操作</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {group.rows.map((r) => {
                          const substitute = isSubstitute(r);
                          return (
                            <tr key={r.id} className={`${r.cancelled ? "opacity-50" : ""} ${isUnassigned(r) ? "bg-rose-50/40" : ""} hover:bg-slate-50/70`}>
                              <td className="px-4 py-4 whitespace-nowrap">{fmtShort(r.date)}</td>
                              <td className="px-4 py-4">
                                <div className="font-medium text-slate-900">{courseLabel(r.course.courseType)}</div>
                                <div className="font-mono text-xs text-slate-400">{r.course.code}</div>
                              </td>
                              <td className="px-4 py-4">
                                {isUnassigned(r)
                                  ? <div className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-1 text-xs font-semibold text-rose-700">⚠ 待指派老師</div>
                                  : <div className={substitute ? "font-medium text-orange-700" : "text-slate-700"}>{r.actualTeacher.name}</div>
                                }
                                {!isUnassigned(r) && (r.assistantTeacher || r.course.assistantTeacher) && <div className="mt-1 text-xs text-blue-600">助教：{(r.assistantTeacher ?? r.course.assistantTeacher)?.name}</div>}
                                {!isUnassigned(r) && substitute && <div className="mt-1 inline-flex rounded-full bg-orange-100 px-2 py-0.5 text-xs text-orange-700">代課</div>}
                              </td>
                              <td className="px-4 py-4 text-center">
                                {r.studentCount ?? (isCountRequired(r)
                                  ? <span className={r.pendingReport ? "text-amber-600" : "text-slate-400"}>{r.pendingReport ? "待回報" : "未上課"}</span>
                                  : <span className="text-slate-500">免填</span>)}
                                {r.expectedStudentCount != null && <div className="mt-0.5 text-xs text-blue-500">預計 {r.expectedStudentCount}</div>}
                              </td>
                              <td className="px-4 py-4"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">{normalizeCategory(r.category)}</span></td>
                              <td className="px-4 py-4 text-center">
                                {r.hoursNeedsReview ? <span className="text-amber-600">需人工確認</span> : `${r.hours}h`}
                              </td>
                              <td className="px-4 py-4">
                                <div className="flex flex-col items-start gap-1">
                                  <span className={`rounded-full px-2.5 py-1 text-xs ${
                                    r.cancelled ? "bg-red-100 text-red-600"
                                    : statusLabel(r) === "缺課程進度" ? "bg-amber-100 text-amber-700 font-semibold"
                                    : isReportComplete(r) ? "bg-green-100 text-green-600"
                                    : "bg-slate-100 text-slate-500"
                                  }`}>{statusLabel(r)}</span>
                                  {isCountRequired(r) && r.reportFillStatus && <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">{r.reportFillStatus}</span>}
                                  {r.schoolSignatureData && (
                                    <a href={r.schoolSignatureData} target="_blank" rel="noreferrer" className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700" title={r.schoolSignedAt ? `簽名時間：${new Date(r.schoolSignedAt).toLocaleString("zh-TW")}` : ""}>
                                      園所已簽 · {r.schoolVerifierName || "已確認"}
                                    </a>
                                  )}
                                  {equipmentLabels(r).map((label) => <span key={label} className={`rounded-full px-2.5 py-1 text-xs ${equipmentBadgeClass(label)}`}>📦 {label}</span>)}
                                </div>
                              </td>
                              <td className="max-w-[220px] truncate px-4 py-4 text-xs text-slate-500" title={r.hoursNeedsReview ? `上課時間需人工確認：${r.hoursReviewReason || ""}` : r.cancelReason || r.notes || ""}>{r.hoursNeedsReview ? "上課時間需人工確認" : r.cancelReason || r.notes || "-"}</td>
                              <td className="px-4 py-4">
                                <div className="flex gap-4 whitespace-nowrap">
                                  <button onClick={() => edit(r)} className="text-sm font-medium text-blue-600 hover:text-blue-800">編輯</button>
                                  <Link href={`/course-change-requests?attendanceId=${r.id}`} className="text-sm font-medium text-cyan-700 hover:text-cyan-900">申請異動</Link>
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
          <div className="rounded-xl border border-slate-200 bg-white py-12 text-center text-slate-400">
            {loadingRecords ? "出勤紀錄載入中…" : "目前篩選沒有上課紀錄"}
          </div>
        )}
      </div>
    </div>
  );
}
