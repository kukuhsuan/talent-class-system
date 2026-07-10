"use client";

import { useEffect, useMemo, useState } from "react";
import { SaveButton } from "@/components/SaveButton";
import { Toast } from "@/components/Toast";
import { ensureOk } from "@/lib/clientApi";
import { useToast } from "@/lib/useToast";

const DELIVERY_METHODS = ["未安排", "教練送", "員工送", "物流送", "園所自取", "其他"];
const STATUSES = ["未詢問", "已詢問", "已接受", "已送達", "無法協助", "已取消"];

type Flow = {
  id: number;
  attendanceId: number | null;
  courseId: number | null;
  date: string;
  courseTime: string;
  courseName: string;
  schoolName: string;
  schoolAddress: string;
  equipmentName: string;
  equipmentContent: string;
  currentLocation: string;
  nextSchoolName: string;
  nextDate: string;
  nextAddress: string;
  deliveryMethod: string;
  responsiblePerson: string;
  responsibleTeacherId: number | null;
  responsiblePhone: string;
  transportSubsidyEligible: boolean;
  status: string;
  notes: string;
  updatedBy: string;
  updatedAt: string;
};

type SchoolOption = { id: number; name: string; type: string; region: string; address: string };
type AttendanceOption = {
  id: number;
  date: string;
  courseTime: string;
  courseId: number;
  courseCode: string;
  courseName: string;
  schoolName: string;
  schoolAddress: string;
  teacherId: number;
  teacherName: string;
  teacherPhone: string;
};

type FormState = Omit<Flow, "id" | "updatedAt" | "updatedBy"> & { id?: number };

const emptyForm: FormState = {
  attendanceId: null,
  courseId: null,
  date: "",
  courseTime: "",
  courseName: "",
  schoolName: "",
  schoolAddress: "",
  equipmentName: "",
  equipmentContent: "",
  currentLocation: "",
  nextSchoolName: "",
  nextDate: "",
  nextAddress: "",
  deliveryMethod: "未安排",
  responsiblePerson: "",
  responsibleTeacherId: null,
  responsiblePhone: "",
  transportSubsidyEligible: false,
  status: "未詢問",
  notes: "",
};

function statusClass(status: string) {
  if (status === "已送達" || status === "已接受") return "bg-emerald-50 text-emerald-700";
  if (status === "無法協助") return "bg-red-50 text-red-700";
  if (status === "已詢問") return "bg-blue-50 text-blue-700";
  if (status === "已取消") return "bg-slate-100 text-slate-500";
  return "bg-slate-100 text-slate-600";
}

function fieldValue(value: string) {
  return value.trim() || "-";
}

export default function EquipmentWherePage() {
  const [flows, setFlows] = useState<Flow[]>([]);
  const [schools, setSchools] = useState<SchoolOption[]>([]);
  const [attendances, setAttendances] = useState<AttendanceOption[]>([]);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [filters, setFilters] = useState({ date: "", course: "", school: "", status: "", deliveryMethod: "", responsible: "", search: "" });
  const [courseSearch, setCourseSearch] = useState("");
  const [coursePickerOpen, setCoursePickerOpen] = useState(false);
  const [nextSchoolSearch, setNextSchoolSearch] = useState("");
  const [nextSchoolPickerOpen, setNextSchoolPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const { toast, showToast } = useToast();

  const query = useMemo(() => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
    return params.toString();
  }, [filters]);

  async function loadFlows() {
    setLoading(true);
    try {
      const res = await fetch(`/api/equipment-where${query ? `?${query}` : ""}`, { cache: "no-store" });
      await ensureOk(res, "讀取器材流向失敗");
      setFlows(await res.json());
    } catch (error) {
      showToast("error", (error as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function loadOptions() {
    const res = await fetch("/api/equipment-where/options", { cache: "no-store" });
    await ensureOk(res, "讀取課程與老師選項失敗");
    const data = await res.json();
    setSchools(data.schools ?? []);
    setAttendances(data.attendances ?? []);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadOptions().catch((error) => showToast("error", (error as Error).message));
    }, 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadFlows();
    }, 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const filteredAttendances = useMemo(() => {
    const q = courseSearch.trim().toLowerCase();
    const rows = q
      ? attendances.filter((item) => `${item.date} ${item.courseTime} ${item.schoolName} ${item.courseName} ${item.teacherName}`.toLowerCase().includes(q))
      : attendances;
    return rows.slice(0, 40);
  }, [attendances, courseSearch]);

  const filteredNextSchools = useMemo(() => {
    const q = nextSchoolSearch.trim().toLowerCase();
    const rows = q
      ? schools.filter((item) => `${item.name} ${item.region} ${item.address}`.toLowerCase().includes(q))
      : schools;
    return rows.slice(0, 40);
  }, [nextSchoolSearch, schools]);

  function attendanceLabel(attendance: AttendanceOption) {
    return `${attendance.date.replaceAll("-", "/")} ${attendance.courseTime}｜${attendance.schoolName}｜${attendance.courseName}｜${attendance.teacherName}`;
  }

  function chooseAttendance(attendance: AttendanceOption | null) {
    if (!attendance) {
      setForm((prev) => ({ ...prev, attendanceId: null, courseId: null }));
      setCourseSearch("");
      return;
    }
    setForm((prev) => ({
      ...prev,
      attendanceId: attendance.id,
      courseId: attendance.courseId,
      date: attendance.date,
      courseTime: attendance.courseTime,
      courseName: attendance.courseName,
      schoolName: attendance.schoolName,
      schoolAddress: attendance.schoolAddress,
      currentLocation: prev.currentLocation || attendance.schoolName,
      responsibleTeacherId: attendance.teacherId,
      responsiblePerson: attendance.teacherName,
      responsiblePhone: attendance.teacherPhone,
    }));
    setCourseSearch(attendanceLabel(attendance));
    setCoursePickerOpen(false);
  }

  function chooseNextSchool(school: SchoolOption | null) {
    setForm((prev) => ({
      ...prev,
      nextSchoolName: school?.name ?? nextSchoolSearch,
      nextAddress: school?.address ?? prev.nextAddress,
    }));
    setNextSchoolSearch(school?.name ?? nextSchoolSearch);
    setNextSchoolPickerOpen(false);
  }

  async function save() {
    setSaving(true);
    try {
      const url = form.id ? `/api/equipment-where/${form.id}` : "/api/equipment-where";
      const res = await fetch(url, {
        method: form.id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      await ensureOk(res, "儲存器材流向失敗");
      resetForm();
      showToast("success", "器材流向已儲存");
      await loadFlows();
    } catch (error) {
      showToast("error", (error as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(flow: Flow, status: string) {
    try {
      const res = await fetch(`/api/equipment-where/${flow.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, flow }),
      });
      await ensureOk(res, "更新狀態失敗");
      showToast("success", `已標記為${status}`);
      await loadFlows();
    } catch (error) {
      showToast("error", (error as Error).message);
    }
  }

  async function notify(flow: Flow) {
    try {
      const res = await fetch(`/api/equipment-where/${flow.id}/notify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flow }),
      });
      await ensureOk(res, "發送 LINE 詢問失敗");
      const data = await res.json();
      showToast("success", `已發送給 ${data.teacher}`);
      await loadFlows();
    } catch (error) {
      showToast("error", (error as Error).message);
    }
  }

  async function remove(flow: Flow) {
    if (!confirm(`確定作廢「${flow.equipmentName}」這筆器材流向？`)) return;
    try {
      const res = await fetch(`/api/equipment-where/${flow.id}`, { method: "DELETE" });
      await ensureOk(res, "作廢器材流向失敗");
      showToast("success", "器材流向已作廢");
      await loadFlows();
    } catch (error) {
      showToast("error", (error as Error).message);
    }
  }

  function edit(flow: Flow) {
    setForm({
      attendanceId: flow.attendanceId,
      courseId: flow.courseId,
      date: flow.date,
      courseTime: flow.courseTime,
      courseName: flow.courseName,
      schoolName: flow.schoolName,
      schoolAddress: flow.schoolAddress,
      equipmentName: flow.equipmentName,
      equipmentContent: flow.equipmentContent,
      currentLocation: flow.currentLocation,
      nextSchoolName: flow.nextSchoolName,
      nextDate: flow.nextDate,
      nextAddress: flow.nextAddress,
      deliveryMethod: flow.deliveryMethod,
      responsiblePerson: flow.responsiblePerson,
      responsibleTeacherId: flow.responsibleTeacherId,
      responsiblePhone: flow.responsiblePhone,
      transportSubsidyEligible: flow.transportSubsidyEligible,
      status: flow.status,
      notes: flow.notes,
      id: flow.id,
    });
    const attendance = attendances.find((item) => item.id === flow.attendanceId);
    setCourseSearch(attendance ? attendanceLabel(attendance) : "");
    setNextSchoolSearch(flow.nextSchoolName);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function resetForm() {
    setForm(emptyForm);
    setCourseSearch("");
    setNextSchoolSearch("");
  }

  const input = "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100";

  return (
    <main className="mx-auto max-w-7xl space-y-5 px-4 py-6 text-slate-800">
      <Toast toast={toast} />
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">器材在哪兒</h1>
          <p className="mt-1 text-sm text-slate-500">追蹤器材目前位置、下一站、詢問對象與配送狀態。</p>
        </div>
        <button onClick={resetForm} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">
          清空表單
        </button>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-4">
          <div className="space-y-1 text-sm font-semibold text-slate-600 md:col-span-2">
            連動既有課程
            <div className="relative" onBlur={() => window.setTimeout(() => setCoursePickerOpen(false), 120)}>
              <input
                value={courseSearch}
                onFocus={() => setCoursePickerOpen(true)}
                onChange={(e) => {
                  setCourseSearch(e.target.value);
                  setCoursePickerOpen(true);
                  if (!e.target.value.trim()) chooseAttendance(null);
                }}
                className={input}
                placeholder="搜尋日期、園所、課程、老師"
              />
              {coursePickerOpen && (
                <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-72 overflow-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => chooseAttendance(null)}
                    className="block w-full px-3 py-2 text-left text-sm text-slate-500 hover:bg-slate-50"
                  >
                    手動新增，不綁課程
                  </button>
                  {filteredAttendances.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => chooseAttendance(item)}
                      className={`block w-full px-3 py-2 text-left text-sm hover:bg-blue-50 ${form.attendanceId === item.id ? "bg-blue-50 text-blue-700" : "text-slate-700"}`}
                    >
                      <span className="font-semibold">{item.date.replaceAll("-", "/")} {item.courseTime}</span>
                      <span className="ml-2">{item.schoolName}｜{item.courseName}｜{item.teacherName}</span>
                    </button>
                  ))}
                  {!filteredAttendances.length && <div className="px-3 py-3 text-sm text-slate-400">找不到符合的課程</div>}
                </div>
              )}
            </div>
          </div>
          <label className="space-y-1 text-sm font-semibold text-slate-600">
            日期
            <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className={input} />
          </label>
          <label className="space-y-1 text-sm font-semibold text-slate-600">
            課程名稱
            <input value={form.courseName} onChange={(e) => setForm({ ...form, courseName: e.target.value })} className={input} placeholder="足球" />
          </label>
          <label className="space-y-1 text-sm font-semibold text-slate-600">
            園所名稱
            <input value={form.schoolName} onChange={(e) => setForm({ ...form, schoolName: e.target.value })} className={input} />
          </label>
          <label className="space-y-1 text-sm font-semibold text-slate-600 md:col-span-2">
            園所地址
            <input value={form.schoolAddress} onChange={(e) => setForm({ ...form, schoolAddress: e.target.value })} className={input} />
          </label>
          <label className="space-y-1 text-sm font-semibold text-slate-600">
            器材名稱
            <input value={form.equipmentName} onChange={(e) => setForm({ ...form, equipmentName: e.target.value })} className={input} placeholder="足球器材" />
          </label>
          <label className="space-y-1 text-sm font-semibold text-slate-600">
            目前位置
            <input value={form.currentLocation} onChange={(e) => setForm({ ...form, currentLocation: e.target.value })} className={input} />
          </label>
          <div className="space-y-1 text-sm font-semibold text-slate-600">
            下一站園所
            <div className="relative" onBlur={() => window.setTimeout(() => setNextSchoolPickerOpen(false), 120)}>
              <input
                value={nextSchoolSearch}
                onFocus={() => setNextSchoolPickerOpen(true)}
                onChange={(e) => {
                  setNextSchoolSearch(e.target.value);
                  setNextSchoolPickerOpen(true);
                  setForm({ ...form, nextSchoolName: e.target.value });
                }}
                className={input}
                placeholder="搜尋園所名稱、區域、地址"
              />
              {nextSchoolPickerOpen && (
                <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-72 overflow-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => chooseNextSchool(null)}
                    className="block w-full px-3 py-2 text-left text-sm text-slate-500 hover:bg-slate-50"
                  >
                    其他 / 手動輸入
                  </button>
                  {filteredNextSchools.map((school) => (
                    <button
                      key={school.id}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => chooseNextSchool(school)}
                      className={`block w-full px-3 py-2 text-left text-sm hover:bg-blue-50 ${form.nextSchoolName === school.name ? "bg-blue-50 text-blue-700" : "text-slate-700"}`}
                    >
                      <span className="font-semibold">{school.name}</span>
                      <span className="ml-2 text-xs text-slate-400">{school.region || "未填區域"}</span>
                      {school.address && <span className="block truncate text-xs text-slate-400">{school.address}</span>}
                    </button>
                  ))}
                  {!filteredNextSchools.length && <div className="px-3 py-3 text-sm text-slate-400">找不到符合的園所，可直接手動輸入</div>}
                </div>
              )}
            </div>
          </div>
          <label className="space-y-1 text-sm font-semibold text-slate-600">
            下一站日期
            <input type="date" value={form.nextDate} onChange={(e) => setForm({ ...form, nextDate: e.target.value })} className={input} />
          </label>
          <label className="space-y-1 text-sm font-semibold text-slate-600 md:col-span-2">
            下一站地址
            <input value={form.nextAddress} onChange={(e) => setForm({ ...form, nextAddress: e.target.value })} className={input} />
          </label>
          <label className="space-y-1 text-sm font-semibold text-slate-600">
            運送方式
            <select value={form.deliveryMethod} onChange={(e) => setForm({ ...form, deliveryMethod: e.target.value })} className={input}>
              {DELIVERY_METHODS.map((method) => <option key={method}>{method}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-sm font-semibold text-slate-600">
            狀態
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className={input}>
              {STATUSES.map((status) => <option key={status}>{status}</option>)}
            </select>
          </label>
          <label className="flex items-start gap-3 rounded-lg border border-blue-100 bg-blue-50 px-3 py-3 text-sm font-semibold text-slate-700 md:col-span-1">
            <input
              type="checkbox"
              checked={form.transportSubsidyEligible}
              onChange={(e) => setForm({ ...form, transportSubsidyEligible: e.target.checked })}
              className="mt-1 h-4 w-4"
            />
            <span>
              車程 15 分鐘以上補貼 100 元
              <span className="block text-xs font-normal text-slate-500">勾選後會顯示在 LINE 詢問卡</span>
            </span>
          </label>
          <label className="space-y-1 text-sm font-semibold text-slate-600 md:col-span-3">
            備註
            <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className={input} />
          </label>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <SaveButton saving={saving} onClick={save} idleText={form.id ? "更新器材流向" : "新增器材流向"} />
          {form.id && (
            <button onClick={resetForm} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">
              取消編輯
            </button>
          )}
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-6">
          <input type="date" value={filters.date} onChange={(e) => setFilters({ ...filters, date: e.target.value })} className={input} />
          <input value={filters.course} onChange={(e) => setFilters({ ...filters, course: e.target.value })} className={input} placeholder="課程" />
          <input value={filters.school} onChange={(e) => setFilters({ ...filters, school: e.target.value })} className={input} placeholder="園所" />
          <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })} className={input}>
            <option value="">全部狀態</option>
            {STATUSES.map((status) => <option key={status}>{status}</option>)}
          </select>
          <select value={filters.deliveryMethod} onChange={(e) => setFilters({ ...filters, deliveryMethod: e.target.value })} className={input}>
            <option value="">全部方式</option>
            {DELIVERY_METHODS.map((method) => <option key={method}>{method}</option>)}
          </select>
          <input value={filters.responsible} onChange={(e) => setFilters({ ...filters, responsible: e.target.value })} className={input} placeholder="詢問對象" />
          <input value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} className={input} placeholder="搜尋器材/位置" />
        </div>
      </section>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <div className="font-bold text-slate-900">流向列表</div>
          <div className="text-sm text-slate-500">{loading ? "讀取中" : `${flows.length} 筆`}</div>
        </div>

        <div className="hidden overflow-x-auto md:block">
          <table className="min-w-full divide-y divide-slate-100 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-bold text-slate-500">
              <tr>
                <th className="px-4 py-3">日期</th>
                <th className="px-4 py-3">器材</th>
                <th className="px-4 py-3">目前位置</th>
                <th className="px-4 py-3">下一站</th>
                <th className="px-4 py-3">詢問對象</th>
                <th className="px-4 py-3">狀態</th>
                <th className="px-4 py-3">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {flows.map((flow) => (
                <tr key={flow.id} className="align-top">
                  <td className="px-4 py-3 whitespace-nowrap">{fieldValue(flow.date)}</td>
                  <td className="px-4 py-3 min-w-[140px] font-semibold">{fieldValue(flow.equipmentName)}</td>
                  <td className="px-4 py-3 min-w-[150px]">{fieldValue(flow.currentLocation)}</td>
                  <td className="px-4 py-3 min-w-[170px]">{fieldValue(flow.nextSchoolName)}<div className="text-xs text-slate-400">{fieldValue(flow.nextDate)}</div></td>
                  <td className="px-4 py-3 whitespace-nowrap">{fieldValue(flow.responsiblePerson)}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={`rounded-full px-2 py-1 text-xs font-bold ${statusClass(flow.status)}`}>{flow.status}</span>
                    {flow.transportSubsidyEligible && <div className="mt-1 text-xs font-semibold text-blue-600">補貼 100 元</div>}
                    {flow.status === "無法協助" && <div className="mt-1 rounded bg-red-50 px-2 py-1 text-xs font-semibold text-red-700">教練無法協助，請行政另行安排。</div>}
                    {flow.status === "已送達" && <div className="mt-1 text-xs text-slate-400">{fieldValue(flow.updatedBy)}｜{fieldValue(flow.updatedAt)}</div>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => edit(flow)} className="text-blue-600 hover:underline">編輯</button>
                      <button onClick={() => notify(flow)} className="text-blue-600 hover:underline">詢問教練協助</button>
                      <button onClick={() => updateStatus(flow, "已送達")} className="text-emerald-600 hover:underline">已送達</button>
                      <button onClick={() => remove(flow)} className="text-red-600 hover:underline">作廢</button>
                    </div>
                  </td>
                </tr>
              ))}
              {!flows.length && (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-400">目前沒有符合條件的器材流向。</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="space-y-3 p-3 md:hidden">
          {flows.map((flow) => (
            <article key={flow.id} className="rounded-lg border border-slate-200 p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs text-slate-400">{fieldValue(flow.date)}</div>
                  <div className="mt-1 text-lg font-bold text-slate-900">{fieldValue(flow.equipmentName)}</div>
                </div>
                <span className={`rounded-full px-2 py-1 text-xs font-bold ${statusClass(flow.status)}`}>{flow.status}</span>
              </div>
              <dl className="mt-3 grid gap-2 text-sm">
                <div><dt className="font-semibold text-slate-500">目前位置</dt><dd>{fieldValue(flow.currentLocation)}</dd></div>
                <div><dt className="font-semibold text-slate-500">下一站</dt><dd>{fieldValue(flow.nextSchoolName)} {flow.nextDate ? `｜${flow.nextDate}` : ""}</dd></div>
                <div><dt className="font-semibold text-slate-500">詢問對象</dt><dd>{fieldValue(flow.responsiblePerson)}</dd></div>
                {flow.transportSubsidyEligible && <div><dt className="font-semibold text-slate-500">補貼</dt><dd>車程 15 分鐘以上補貼 100 元</dd></div>}
                {flow.status === "無法協助" && <div className="rounded-lg bg-red-50 p-2 text-red-700"><dt className="font-semibold">提醒</dt><dd>教練無法協助，請行政另行安排。</dd></div>}
                {flow.status === "已送達" && <div><dt className="font-semibold text-slate-500">送達紀錄</dt><dd>{fieldValue(flow.updatedBy)}｜{fieldValue(flow.updatedAt)}</dd></div>}
              </dl>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button onClick={() => edit(flow)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold">編輯</button>
                <button onClick={() => notify(flow)} className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700">詢問教練協助</button>
                <button onClick={() => updateStatus(flow, "已送達")} className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">標記已送達</button>
                <button onClick={() => updateStatus(flow, "已取消")} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-600">標記已取消</button>
              </div>
            </article>
          ))}
          {!flows.length && <div className="rounded-lg border border-dashed border-slate-200 p-8 text-center text-sm text-slate-400">目前沒有符合條件的器材流向。</div>}
        </div>
      </section>
    </main>
  );
}
