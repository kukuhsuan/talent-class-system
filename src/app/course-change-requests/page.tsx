"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { SearchableSelect } from "@/components/SearchableSelect";
import { courseLabel } from "@/lib/courseMeta";

type AttendanceOption = {
  id: number; courseId: number; date: string; time: string; schoolId: number | null; school: string; address: string; location: string;
  courseType: string; teacherId: number; teacherName: string; isPayrollLocked: boolean; completed: boolean;
};
type SchoolOption = { id: number; name: string; region: string; address: string; type: string };
type ChangeRequest = {
  id: number; courseId: number; teacherId: number; primaryAttendanceId: number; requestSource: string; requestedByName: string;
  changeScope: string; changeTypes: string[]; originalDate: string; newDate: string | null;
  originalStartTime: string; originalEndTime: string; newStartTime: string; newEndTime: string;
  originalSchoolName: string; newSchoolId: number | null; newSchoolName: string; originalAddress: string; newAddress: string;
  originalLocation: string; newLocation: string; newStudentCount: number | null; reasonType: string; reasonNote: string; reviewNote: string;
  status: string; teacherResponse: string; teacherRespondedAt: string | null; createdAt: string; appliedAt: string | null;
  course: { courseType: string }; teacher: { name: string };
  targets: Array<{ attendanceId: number; originalDate: string }>;
};

const EMPTY_FORM = {
  attendanceId: "", scope: "SINGLE", targetIds: [] as number[], changeTypes: [] as string[], newDate: "",
  newStartTime: "", newEndTime: "", newSchoolId: "", newSchoolName: "", newAddress: "", newLocation: "", newStudentCount: "",
  reasonType: "園所活動", reasonNote: "",
};
const STATUS_OPTIONS = ["", "待行政審核", "待老師回覆", "老師可配合", "老師無法配合", "需要討論", "已完成", "已取消"];

function statusClass(status: string) {
  if (status === "已完成" || status === "老師可配合") return "bg-emerald-50 text-emerald-700";
  if (status === "老師無法配合" || status === "已取消") return "bg-rose-50 text-rose-700";
  if (status === "需要討論") return "bg-amber-50 text-amber-700";
  return "bg-blue-50 text-blue-700";
}

function changeSummary(item: ChangeRequest) {
  const rows: string[] = [];
  if (item.changeTypes.includes("DATE")) rows.push(`日期 ${item.originalDate.slice(0, 10)} → ${item.newDate?.slice(0, 10) || "—"}`);
  if (item.changeTypes.includes("TIME")) rows.push(`時間 ${item.originalStartTime}-${item.originalEndTime} → ${item.newStartTime}-${item.newEndTime}`);
  if (item.changeTypes.includes("LOCATION")) rows.push(`地點 ${[item.originalSchoolName, item.originalLocation].filter(Boolean).join("・")} → ${[item.newSchoolName || item.originalSchoolName, item.newLocation].filter(Boolean).join("・")}`);
  if (item.changeTypes.includes("STUDENT_COUNT")) rows.push(`人數 調整後 ${item.newStudentCount ?? "—"} 人`);
  if (item.changeTypes.includes("CANCEL")) rows.push(`停課 ${item.originalDate.slice(0, 10)} 本堂申請停課`);
  return rows;
}

export default function CourseChangeRequestsPage() {
  const [attendances, setAttendances] = useState<AttendanceOption[]>([]);
  const [schools, setSchools] = useState<SchoolOption[]>([]);
  const [items, setItems] = useState<ChangeRequest[]>([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [optionsLoaded, setOptionsLoaded] = useState(false);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [keyword, setKeyword] = useState("");
  const [pickSchool, setPickSchool] = useState("");
  const [status, setStatus] = useState(() => typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("status") ?? "");
  const [source, setSource] = useState("");

  const selected = attendances.find((item) => item.id === Number(form.attendanceId)) ?? null;
  const sameCourseAttendances = selected ? attendances.filter((item) => item.courseId === selected.courseId) : [];

  const loadOptions = useCallback(async () => {
    if (optionsLoaded || optionsLoading) return { attendances, schools };
    setOptionsLoading(true);
    try {
    const response = await fetch("/api/course-change-requests/options", { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "選項載入失敗");
    setAttendances(body.attendances ?? []);
    setSchools(body.schools ?? []);
    setOptionsLoaded(true);
    const params = new URLSearchParams(window.location.search);
    const attendanceId = Number(params.get("attendanceId"));
    const courseId = Number(params.get("courseId"));
    const initial = body.attendances?.find((item: AttendanceOption) => item.id === attendanceId)
      ?? body.attendances?.find((item: AttendanceOption) => item.courseId === courseId);
    if (initial) {
      setPickSchool(initial.school);
      setForm((current) => ({ ...current, attendanceId: String(initial.id), targetIds: [initial.id] }));
      setShowForm(true);
    }
    return body;
    } finally {
      setOptionsLoading(false);
    }
  }, [attendances, optionsLoaded, optionsLoading, schools]);

  const loadItems = useCallback(async () => {
    const params = new URLSearchParams();
    if (keyword) params.set("keyword", keyword);
    if (status) params.set("status", status);
    if (source) params.set("source", source);
    const response = await fetch(`/api/course-change-requests?${params}`, { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "異動申請載入失敗");
    setItems(body.items ?? []);
  }, [keyword, source, status]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("attendanceId") || params.get("courseId")) {
      void Promise.resolve().then(() => loadOptions()).catch((error) => setMessage(error.message));
    }
  }, [loadOptions]);
  useEffect(() => {
    void Promise.resolve().then(() => loadItems()).catch((error) => setMessage(error.message)).finally(() => setLoading(false));
  }, [loadItems]);

  const pickSchoolOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of attendances) counts.set(item.school, (counts.get(item.school) ?? 0) + 1);
    return [...counts.entries()].map(([name, count]) => ({ value: name, label: `${name}（${count} 堂）`, searchText: name }));
  }, [attendances]);
  const attendanceSelectOptions = useMemo(() => attendances
    .filter((item) => pickSchool && item.school === pickSchool)
    .map((item) => ({
      value: item.id,
      label: `${item.date.replaceAll("-", "/")}｜${courseLabel(item.courseType)}｜${item.time}｜${item.teacherName}`,
      searchText: `${item.date} ${item.school} ${item.courseType} ${courseLabel(item.courseType)} ${item.teacherName}`,
    })), [attendances, pickSchool]);
  const schoolSelectOptions = useMemo(() => schools.map((school) => ({
    value: school.id,
    label: `${school.name}｜${school.region || "區域未填"}｜${school.address || "地址未填"}`,
    searchText: `${school.name} ${school.region} ${school.address}`,
  })), [schools]);

  function selectAttendance(value: number | null) {
    const item = attendances.find((row) => row.id === value);
    setForm((current) => ({
      ...current,
      attendanceId: value ? String(value) : "",
      targetIds: value ? [value] : [],
      newDate: item?.date ?? "",
      newStartTime: item?.time.split("-")[0] ?? "",
      newEndTime: item?.time.split("-")[1] ?? "",
    }));
  }

  function selectSchool(value: number | null) {
    const school = schools.find((row) => row.id === value);
    setForm((current) => ({ ...current, newSchoolId: value ? String(value) : "", newSchoolName: school?.name ?? "", newAddress: school?.address ?? "" }));
  }

  function toggleType(type: string) {
    setForm((current) => ({ ...current, changeTypes: current.changeTypes.includes(type) ? current.changeTypes.filter((item) => item !== type) : [...current.changeTypes, type] }));
  }

  function resetForm() {
    setForm(EMPTY_FORM);
    setPickSchool("");
    setEditingId(null);
    setShowForm(false);
  }

  async function save() {
    setSaving(true); setMessage("");
    try {
      const attendanceIds = form.scope === "SELECTED" ? form.targetIds : [Number(form.attendanceId)];
      const payload = { ...form, attendanceIds, changeScope: form.scope, newSchoolId: form.newSchoolId ? Number(form.newSchoolId) : null, newStudentCount: form.newStudentCount === "" ? null : Number(form.newStudentCount) };
      const response = await fetch(editingId ? `/api/course-change-requests/${editingId}` : "/api/course-change-requests", {
        method: editingId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "儲存失敗");
      setMessage(editingId ? "異動申請已更新" : "異動申請已建立，尚未修改正式課表");
      resetForm(); await loadItems();
    } catch (error) { setMessage((error as Error).message); } finally { setSaving(false); }
  }

  function editItem(item: ChangeRequest, attendanceRows = attendances) {
    setEditingId(item.id); setShowForm(true);
    const attendance = attendanceRows.find((row) => row.id === item.primaryAttendanceId);
    setPickSchool(attendance?.school ?? item.originalSchoolName);
    setForm({
      attendanceId: String(item.primaryAttendanceId), scope: item.changeScope, targetIds: item.targets.map((target) => target.attendanceId),
      changeTypes: item.changeTypes, newDate: item.newDate?.slice(0, 10) ?? "", newStartTime: item.newStartTime, newEndTime: item.newEndTime,
      newSchoolId: item.newSchoolId ? String(item.newSchoolId) : "", newSchoolName: item.newSchoolName, newAddress: item.newAddress, newLocation: item.newLocation,
      newStudentCount: item.newStudentCount == null ? "" : String(item.newStudentCount),
      reasonType: item.reasonType, reasonNote: item.reasonNote,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function openCreateForm() {
    resetForm();
    setShowForm(true);
    setMessage("");
    try { await loadOptions(); } catch (error) { setMessage((error as Error).message || "課程選項載入失敗"); }
  }

  async function openEditForm(item: ChangeRequest) {
    setMessage("");
    try {
      const options = await loadOptions();
      editItem(item, options?.attendances ?? attendances);
    } catch (error) { setMessage((error as Error).message || "課程選項載入失敗"); }
  }

  async function action(item: ChangeRequest, name: "send" | "apply" | "cancel" | "return") {
    const prompt = name === "apply" ? "確定要將此異動套用至正式課表嗎？" : name === "cancel" ? "確定取消這筆異動申請嗎？" : "";
    if (prompt && !window.confirm(prompt)) return;
    const note = name === "return" ? window.prompt("請輸入需要園所補充的內容", "請補充異動資料") : "";
    if (name === "return" && note == null) return;
    setMessage("");
    const url = name === "send" ? `/api/course-change-requests/${item.id}/send-inquiry` : name === "apply" ? `/api/course-change-requests/${item.id}/apply` : `/api/course-change-requests/${item.id}`;
    const response = await fetch(url, {
      method: name === "cancel" || name === "return" ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(name === "cancel" || name === "return" ? { action: name, note } : {}),
    });
    const body = await response.json();
    if (!response.ok) { setMessage(body.error || "操作失敗"); return; }
    setMessage(name === "send" ? "已發送 LINE 詢問老師" : name === "apply" ? "異動已套用至正式課表" : "申請狀態已更新");
    await loadItems(); await loadOptions();
  }

  async function arrangeSubstitute(item: ChangeRequest) {
    const response = await fetch(`/api/course-change-requests/${item.id}/arrange-substitute`, { method: "POST" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) { setMessage(body.error || "建立代課安排失敗"); return; }
    window.location.href = "/teacher-leaves";
  }

  return (
    <div className="mx-auto max-w-7xl p-4 md:p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-2xl font-bold text-slate-900">課程異動申請</h1><p className="mt-1 text-sm text-slate-500">異動經老師回覆與行政確認後，才會更新正式課表。</p></div>
        <button onClick={openCreateForm} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">新增異動申請</button>
      </div>
      {message && <div className="mb-4 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-medium text-blue-800">{message}</div>}

      {showForm && <section className="mb-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
        <h2 className="mb-4 font-bold text-slate-800">{editingId ? `行政修改申請 #${editingId}` : "建立異動申請"}</h2>
        {optionsLoading && <div className="mb-4 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-500">課程選項載入中…</div>}
        <div className="grid gap-4 md:grid-cols-2">
          <label><span className="mb-1 block text-sm font-semibold text-slate-700">1. 選擇安親班／園所</span><SearchableSelect options={pickSchoolOptions} value={pickSchool || null} onChange={(value) => { setPickSchool(value ?? ""); selectAttendance(null); }} allowEmpty={false} placeholder="搜尋安親班／園所名稱" emptyText="查無符合的園所，請確認關鍵字" /></label>
          <label><span className="mb-1 block text-sm font-semibold text-slate-700">2. 選擇課程時段</span><SearchableSelect options={attendanceSelectOptions} value={form.attendanceId ? Number(form.attendanceId) : null} onChange={selectAttendance} allowEmpty={false} placeholder={pickSchool ? "搜尋日期、課程或老師" : "請先選擇安親班／園所"} emptyText={pickSchool ? "查無符合的課程，請確認關鍵字" : "請先選擇安親班／園所"} /></label>
          {selected && <div className="md:col-span-2 rounded-lg bg-slate-50 p-3 text-sm leading-6 text-slate-600">園所：{selected.school}｜老師：{selected.teacherName}｜地址：{selected.address || "未填寫"}｜原地點：{selected.location || "未填寫"}{(selected.isPayrollLocked || selected.completed) && <span className="ml-2 font-bold text-rose-600">此堂已鎖薪或完成，不可申請</span>}</div>}
          <fieldset className="md:col-span-2"><legend className="mb-2 text-sm font-semibold text-slate-700">異動類型</legend><div className="flex flex-wrap gap-3">{[["DATE", "日期異動"], ["TIME", "時間異動"], ["LOCATION", "地點異動"], ["STUDENT_COUNT", "人數變更"], ["CANCEL", "停課／取消"]].map(([value, label]) => <label key={value} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm"><input type="checkbox" checked={form.changeTypes.includes(value)} onChange={() => toggleType(value)} />{label}</label>)}</div></fieldset>
          <label><span className="mb-1 block text-sm font-semibold text-slate-700">異動範圍</span><select value={form.scope} onChange={(event) => setForm({ ...form, scope: event.target.value, targetIds: selected ? [selected.id] : [] })}><option value="SINGLE">只修改本次課程</option><option value="SELECTED">修改指定日期</option></select></label>
          {form.scope === "SELECTED" && selected && <div className="md:col-span-2 rounded-lg border border-slate-200 p-3"><div className="mb-2 text-sm font-semibold text-slate-700">指定日期</div><div className="flex max-h-40 flex-wrap gap-2 overflow-auto">{sameCourseAttendances.map((item) => <label key={item.id} className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm"><input type="checkbox" checked={form.targetIds.includes(item.id)} onChange={() => setForm((current) => ({ ...current, targetIds: current.targetIds.includes(item.id) ? current.targetIds.filter((id) => id !== item.id) : [...current.targetIds, item.id] }))} />{item.date}</label>)}</div>{form.changeTypes.includes("DATE") && <p className="mt-2 text-xs font-medium text-amber-700">日期異動第一版只能選一堂；指定多日可用於時間或地點異動。</p>}</div>}
          {form.changeTypes.includes("DATE") && <label><span className="mb-1 block text-sm font-semibold text-slate-700">新日期</span><input type="date" value={form.newDate} onChange={(event) => setForm({ ...form, newDate: event.target.value })} /></label>}
          {form.changeTypes.includes("TIME") && <><label><span className="mb-1 block text-sm font-semibold text-slate-700">新開始時間</span><input type="time" value={form.newStartTime} onChange={(event) => setForm({ ...form, newStartTime: event.target.value })} /></label><label><span className="mb-1 block text-sm font-semibold text-slate-700">新結束時間</span><input type="time" value={form.newEndTime} onChange={(event) => setForm({ ...form, newEndTime: event.target.value })} /></label></>}
          {form.changeTypes.includes("STUDENT_COUNT") && <label><span className="mb-1 block text-sm font-semibold text-slate-700">調整後人數</span><input type="number" min={0} value={form.newStudentCount} onChange={(event) => setForm({ ...form, newStudentCount: event.target.value })} placeholder="例如 18" /></label>}
          {form.changeTypes.includes("CANCEL") && <div className="md:col-span-2 rounded-lg bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">停課申請不可與其他異動類型同時選取；套用後該堂課將標記為停課。</div>}
          {form.changeTypes.includes("LOCATION") && <><label><span className="mb-1 block text-sm font-semibold text-slate-700">更換園所／校區</span><SearchableSelect options={schoolSelectOptions} value={form.newSchoolId ? Number(form.newSchoolId) : null} onChange={selectSchool} placeholder="搜尋園所名稱、區域或地址" emptyLabel="同園所或其他地點" emptyText="查無符合的園所，請確認關鍵字" /></label><label><span className="mb-1 block text-sm font-semibold text-slate-700">新上課地點</span><input value={form.newLocation} onChange={(event) => setForm({ ...form, newLocation: event.target.value })} placeholder="例如三樓禮堂" /></label><label className="md:col-span-2"><span className="mb-1 block text-sm font-semibold text-slate-700">新地址／其他地點</span><input value={form.newAddress} onChange={(event) => setForm({ ...form, newAddress: event.target.value })} placeholder="選擇園所後自動帶入，也可手動輸入" /></label></>}
          <label><span className="mb-1 block text-sm font-semibold text-slate-700">異動原因</span><select value={form.reasonType} onChange={(event) => setForm({ ...form, reasonType: event.target.value })}>{["園所活動", "教室調整", "時間調整", "臨時狀況", "其他"].map((reason) => <option key={reason}>{reason}</option>)}</select></label>
          <label><span className="mb-1 block text-sm font-semibold text-slate-700">補充說明{form.reasonType === "其他" ? "（必填）" : ""}</span><input value={form.reasonNote} onChange={(event) => setForm({ ...form, reasonNote: event.target.value })} /></label>
        </div>
        <div className="mt-5 flex gap-2"><button disabled={saving || !form.attendanceId} onClick={save} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? "儲存中…" : editingId ? "更新申請" : "建立申請"}</button><button onClick={resetForm} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600">取消</button></div>
      </section>}

      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="grid gap-3 border-b border-slate-100 p-4 md:grid-cols-3"><input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="搜尋園所、課程、老師或建立人" /><select value={status} onChange={(event) => setStatus(event.target.value)}>{STATUS_OPTIONS.map((item) => <option key={item} value={item}>{item || "全部狀態"}</option>)}</select><select value={source} onChange={(event) => setSource(event.target.value)}><option value="">全部來源</option><option value="ADMIN">行政建立</option><option value="SCHOOL">園所建立</option></select></div>
        <div className="divide-y divide-slate-100">{items.map((item) => <article key={item.id} className="p-4 md:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-bold text-slate-900">{item.originalSchoolName}｜{courseLabel(item.course.courseType)}</h3><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${statusClass(item.status)}`}>{item.status}</span></div><p className="mt-1 text-sm text-slate-500">老師：{item.teacher.name}｜{item.requestSource === "SCHOOL" ? "園所建立" : "行政建立"}｜{new Date(item.createdAt).toLocaleString("zh-TW")}</p></div><span className="text-xs text-slate-400">#{item.id}</span></div>
          <div className="mt-3 grid gap-2 rounded-lg bg-slate-50 p-3 text-sm text-slate-700 md:grid-cols-2">{changeSummary(item).map((row) => <div key={row}>{row}</div>)}<div>原因：{item.reasonType}{item.reasonNote ? `・${item.reasonNote}` : ""}</div><div>影響：{item.targets.length} 堂</div></div>
          {item.status === "老師無法配合" && <div className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700">老師無法配合，請行政另行安排。</div>}
          {item.reviewNote && <div className="mt-3 text-sm text-amber-700">行政備註：{item.reviewNote}</div>}
          <div className="mt-4 flex flex-wrap gap-2">
            {(item.status === "待行政審核" || item.status === "草稿") && <button onClick={() => openEditForm(item)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700">行政修改</button>}
            {["待行政審核", "老師無法配合", "需要討論"].includes(item.status) && <button onClick={() => action(item, "send")} className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white">發送詢問給老師</button>}
            {item.status === "老師可配合" && <button onClick={() => action(item, "apply")} className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white">確認並套用異動</button>}
            {item.status === "老師無法配合" && <button onClick={() => arrangeSubstitute(item)} className="rounded-lg bg-rose-600 px-3 py-2 text-sm font-semibold text-white">安排代課</button>}
            {item.requestSource === "SCHOOL" && item.status === "待行政審核" && <button onClick={() => action(item, "return")} className="rounded-lg border border-amber-200 px-3 py-2 text-sm font-semibold text-amber-700">退回補充</button>}
            {!['已完成', '已取消'].includes(item.status) && <button onClick={() => action(item, "cancel")} className="rounded-lg border border-rose-200 px-3 py-2 text-sm font-semibold text-rose-600">取消申請</button>}
          </div>
        </article>)}{!loading && items.length === 0 && <div className="p-10 text-center text-slate-400">目前沒有符合的課程異動申請</div>}{loading && <div className="p-10 text-center text-slate-400">載入中…</div>}</div>
      </section>
    </div>
  );
}
