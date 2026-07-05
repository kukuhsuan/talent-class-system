"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SaveButton } from "@/components/SaveButton";
import { TeacherCombobox } from "@/components/TeacherCombobox";
import { Toast } from "@/components/Toast";
import { ensureOk } from "@/lib/clientApi";
import { courseLabel } from "@/lib/courseMeta";
import { useScrollToFormOnEdit } from "@/lib/useScrollToFormOnEdit";
import { useToast } from "@/lib/useToast";

type Teacher = { id: number; name: string };
type Role = "主教" | "助教";
type Substitute = {
  id: number | string;
  attendanceId?: number | null;
  source?: "manual" | "attendance" | "linked";
  role?: Role;
  date: string;
  school: string;
  courseType: string;
  originalTeacher: Teacher;
  substituteTeacher: Teacher | null;
  confirmed: boolean;
  fee: number | null;
  notes: string;
  time?: string;
  address?: string;
};
type Candidate = {
  id: number;
  date: string;
  time: string;
  courseCode: string;
  courseType: string;
  originalTeacher: Teacher;
  actualTeacher: Teacher;
  originalAssistantTeacher: Teacher | null;
  assistantTeacher: Teacher | null;
  isPayrollLocked: boolean;
};

const today = () => new Date().toISOString().slice(0, 10);
const emptyForm = () => ({
  school: "",
  date: today(),
  role: "主教" as Role,
  attendanceIds: [] as number[],
  substituteTeacherId: 0,
  confirmed: false,
  fee: "",
  notes: "",
});

export default function SubstitutesPage() {
  const [records, setRecords] = useState<Substitute[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [schools, setSchools] = useState<string[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [filterYear, setFilterYear] = useState(new Date().getFullYear());
  const [filterMonth, setFilterMonth] = useState(new Date().getMonth() + 1);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 50;
  const { toast, showToast } = useToast();
  const showToastRef = useRef(showToast);
  const formRef = useRef<HTMLDivElement | null>(null);
  const firstInputRef = useRef<HTMLSelectElement | null>(null);
  const scrollToFormOnEdit = useScrollToFormOnEdit(formRef, firstInputRef);

  const load = useCallback(async () => {
    const [recordsRes, teachersRes, schoolsRes] = await Promise.all([
      fetch(`/api/substitutes?year=${filterYear}&month=${filterMonth}&page=${page}&pageSize=${pageSize}`),
      fetch("/api/teachers"),
      fetch("/api/substitutes/candidates"),
    ]);
    const [recordsData, teachersData, schoolsData] = await Promise.all([
      recordsRes.json(),
      teachersRes.json(),
      schoolsRes.json(),
    ]);
    setRecords(recordsData.items ?? []);
    setTotal(recordsData.total ?? 0);
    setTeachers(teachersData);
    setSchools(schoolsData.schools ?? []);
  }, [filterYear, filterMonth, page]);

  const loadCandidates = useCallback(async (school: string, date: string) => {
    if (!school || !date) {
      setCandidates([]);
      return;
    }
    setLoadingCandidates(true);
    try {
      const res = await fetch(`/api/substitutes/candidates?school=${encodeURIComponent(school)}&date=${date}`);
      await ensureOk(res, "課堂載入失敗");
      const data = await res.json();
      setCandidates(data.items ?? []);
    } catch (error) {
      showToastRef.current("error", (error as Error).message || "課堂載入失敗");
      setCandidates([]);
    } finally {
      setLoadingCandidates(false);
    }
  }, []);

  useEffect(() => { showToastRef.current = showToast; }, [showToast]);
  useEffect(() => { void Promise.resolve().then(() => load()); }, [load]);
  useEffect(() => { if (showForm) void Promise.resolve().then(() => loadCandidates(form.school, form.date)); }, [form.school, form.date, loadCandidates, showForm]);

  const resetForm = () => {
    setForm(emptyForm());
    setEditing(null);
    setShowForm(false);
    setCandidates([]);
  };

  const save = async () => {
    if (!form.school || !form.date || form.attendanceIds.length === 0 || !form.substituteTeacherId) {
      return showToast("error", "請選擇園所、日期、確切課堂與代課老師");
    }
    if (saving) return;
    setSaving(true);
    try {
      const headers = { "Content-Type": "application/json" };
      const body = JSON.stringify({
        attendanceIds: form.attendanceIds,
        substituteTeacherId: form.substituteTeacherId,
        role: form.role,
        confirmed: form.confirmed,
        fee: form.fee === "" ? null : Number(form.fee),
        notes: form.notes,
      });
      const res = editing
        ? await fetch(`/api/substitutes/${editing}`, { method: "PUT", headers, body })
        : await fetch("/api/substitutes", { method: "POST", headers, body });
      await ensureOk(res, "代課儲存失敗");
      resetForm();
      await load();
      showToast("success", editing ? "代課資料已更新" : "代課已建立，出勤與薪資老師已同步");
    } catch (error) {
      showToast("error", (error as Error).message || "代課儲存失敗", 4000);
    } finally {
      setSaving(false);
    }
  };

  const del = async (record: Substitute) => {
    if (typeof record.id === "string") {
      return showToast("error", "這筆只有出勤資料，請先至出勤紀錄確認");
    }
    const message = record.attendanceId
      ? "確定取消此筆代課？實際老師將恢復為原排課老師。"
      : "這是無法精準配對課堂的舊代課紀錄，確定刪除？";
    if (!confirm(message)) return;
    const res = await fetch(`/api/substitutes/${record.id}`, { method: "DELETE" });
    try {
      await ensureOk(res, "取消代課失敗");
      await load();
      showToast("success", record.attendanceId ? "代課已取消，出勤老師已恢復" : "舊代課紀錄已刪除");
    } catch (error) {
      showToast("error", (error as Error).message || "取消代課失敗");
    }
  };

  const edit = (record: Substitute) => {
    if (typeof record.id === "string" || !record.attendanceId) {
      return showToast("error", "這筆舊資料沒有綁定確切課堂，請重新建立精準代課後再處理");
    }
    setForm({
      school: record.school,
      date: record.date.slice(0, 10),
      role: record.role === "助教" ? "助教" : "主教",
      attendanceIds: [record.attendanceId],
      substituteTeacherId: record.substituteTeacher?.id ?? 0,
      confirmed: record.confirmed,
      fee: record.fee?.toString() ?? "",
      notes: record.notes,
    });
    setEditing(Number(record.id));
    setShowForm(true);
    scrollToFormOnEdit();
  };

  const toggleConfirmed = async (record: Substitute) => {
    if (typeof record.id === "string") return showToast("error", "請至出勤紀錄處理這筆資料");
    const res = await fetch(`/api/substitutes/${record.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmed: !record.confirmed }),
    });
    try {
      await ensureOk(res, "通知狀態更新失敗");
      await load();
    } catch (error) {
      showToast("error", (error as Error).message || "通知狀態更新失敗");
    }
  };

  const toggleAttendance = (id: number) => {
    if (editing) return;
    setForm((current) => ({
      ...current,
      attendanceIds: current.attendanceIds.includes(id)
        ? current.attendanceIds.filter((value) => value !== id)
        : [...current.attendanceIds, id],
    }));
  };

  const originalFor = (candidate: Candidate) => form.role === "助教"
    ? candidate.originalAssistantTeacher
    : candidate.originalTeacher;
  const actualFor = (candidate: Candidate) => form.role === "助教"
    ? candidate.assistantTeacher
    : candidate.actualTeacher;

  return (
    <div>
      <Toast toast={toast} />
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-800">代課紀錄</h1>
          <p className="text-sm text-slate-500">本月共 {total} 筆，代課老師會直接同步到出勤與薪資</p>
        </div>
        <button
          onClick={() => { setForm(emptyForm()); setEditing(null); setShowForm(true); }}
          className="shrink-0 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          + 新增代課
        </button>
      </div>

      <div className="mb-5 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <div><label className="block text-xs text-slate-500 mb-1">年份</label><select value={filterYear} onChange={(e) => { setFilterYear(Number(e.target.value)); setPage(1); }} className="rounded-lg border px-3 py-2 text-sm">{[2024, 2025, 2026, 2027].map((value) => <option key={value}>{value}</option>)}</select></div>
        <div><label className="block text-xs text-slate-500 mb-1">月份</label><select value={filterMonth} onChange={(e) => { setFilterMonth(Number(e.target.value)); setPage(1); }} className="rounded-lg border px-3 py-2 text-sm">{Array.from({ length: 12 }, (_, index) => index + 1).map((value) => <option key={value} value={value}>{value}月</option>)}</select></div>
        <div className="ml-auto flex items-center gap-2 text-sm text-slate-600"><button disabled={page <= 1} onClick={() => setPage((value) => value - 1)} className="rounded-lg border px-3 py-2 disabled:opacity-40">上一頁</button><span>第 {page} / {Math.max(1, Math.ceil(total / pageSize))} 頁</span><button disabled={page >= Math.ceil(total / pageSize)} onClick={() => setPage((value) => value + 1)} className="rounded-lg border px-3 py-2 disabled:opacity-40">下一頁</button></div>
      </div>

      {showForm && (
        <div ref={formRef} className="mb-6 border border-blue-200 bg-white p-5 shadow-sm">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <h2 className="font-semibold text-slate-800">{editing ? "編輯代課" : "建立代課"}</h2>
              <p className="mt-1 text-xs text-slate-500">選擇確切課堂後，系統會同步實際老師；原排課老師仍保留在課程主檔。</p>
            </div>
            {editing && <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">已綁定出勤</span>}
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <div>
              <label>第一步：園所 *</label>
              <select ref={firstInputRef} disabled={Boolean(editing)} value={form.school} onChange={(e) => setForm({ ...form, school: e.target.value, attendanceIds: [] })}>
                <option value="">-- 選擇園所 --</option>
                {schools.map((school) => <option key={school} value={school}>{school}</option>)}
              </select>
            </div>
            <div>
              <label>第二步：日期 *</label>
              <input disabled={Boolean(editing)} type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value, attendanceIds: [] })} />
            </div>
            <div>
              <label>代課身份 *</label>
              <select disabled={Boolean(editing)} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role, attendanceIds: [] })}>
                <option value="主教">主教代課</option>
                <option value="助教">助教代課</option>
              </select>
            </div>
            <div>
              <label>代課老師 *</label>
              <TeacherCombobox
                teachers={teachers}
                value={form.substituteTeacherId || null}
                onChange={(teacherId) => setForm({ ...form, substituteTeacherId: teacherId ?? 0 })}
                placeholder="-- 選擇老師 --"
              />
            </div>
          </div>

          <div className="mt-5">
            <div className="mb-2 text-sm font-semibold text-slate-700">第三步：選擇要代課的課堂 *</div>
            {!form.school || !form.date ? (
              <div className="border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-400">請先選擇園所與日期</div>
            ) : loadingCandidates ? (
              <div className="border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-400">載入當日課堂中...</div>
            ) : candidates.length === 0 ? (
              <div className="border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-400">當天沒有可選擇的出勤課堂</div>
            ) : (
              <div className="divide-y divide-slate-100 border border-slate-200">
                {candidates.map((candidate) => {
                  const original = originalFor(candidate);
                  const actual = actualFor(candidate);
                  const disabled = candidate.isPayrollLocked || !original || (Boolean(editing) && !form.attendanceIds.includes(candidate.id));
                  const checked = form.attendanceIds.includes(candidate.id);
                  return (
                    <label key={candidate.id} className={`flex items-start gap-3 px-4 py-3 ${disabled ? "bg-slate-50 text-slate-400" : "cursor-pointer hover:bg-blue-50/50"}`}>
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={disabled}
                        onChange={() => toggleAttendance(candidate.id)}
                        className="mt-1 h-4 w-4"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                          <span className="font-semibold text-slate-800">{courseLabel(candidate.courseType)}</span>
                          <span className="text-sm text-slate-600">{candidate.time || "時間未填"}</span>
                          <span className="text-xs text-slate-400">{candidate.courseCode}</span>
                        </div>
                        <div className="mt-1 text-xs">
                          原{form.role}：{original?.name ?? "未指派"}
                          {actual && actual.id !== original?.id ? `｜目前實際：${actual.name}` : ""}
                          {candidate.isPayrollLocked ? "｜薪資已鎖定" : ""}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-4">
            <div>
              <label>代課費用（選填）</label>
              <input type="number" value={form.fee} onChange={(e) => setForm({ ...form, fee: e.target.value })} placeholder="不會自動加入薪資" />
            </div>
            <div className="md:col-span-2">
              <label>備註</label>
              <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="代課原因、聯繫事項..." />
            </div>
            <label className="flex items-end gap-2 pb-3 text-sm font-medium text-slate-700">
              <input type="checkbox" checked={form.confirmed} onChange={(e) => setForm({ ...form, confirmed: e.target.checked })} className="h-4 w-4" />
              已通知園所
            </label>
          </div>
          <div className="mt-5 flex gap-2">
            <SaveButton saving={saving} onClick={save} />
            <button disabled={saving} onClick={resetForm} className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200">取消</button>
          </div>
        </div>
      )}

      <div className="overflow-hidden border border-slate-200 bg-white shadow-sm">
        <div className="divide-y divide-slate-100 md:hidden">
          {records.map((record) => (
            <div key={record.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-semibold text-slate-900">{record.school}</div>
                  <div className="mt-1 text-sm text-slate-600">{record.date.slice(0, 10)}｜{courseLabel(record.courseType)}｜{record.time || "-"}</div>
                </div>
                <RecordSource record={record} />
              </div>
              <div className="mt-3 text-sm text-slate-700">{record.role ?? "主教"}：{record.originalTeacher.name} → <strong>{record.substituteTeacher?.name ?? "-"}</strong></div>
              <div className="mt-4 flex gap-4">
                <button onClick={() => toggleConfirmed(record)} className="text-sm font-medium text-emerald-700">{record.confirmed ? "已通知" : "未通知"}</button>
                <button onClick={() => edit(record)} className="text-sm font-medium text-blue-600">編輯</button>
                <button onClick={() => del(record)} className="text-sm font-medium text-red-500">取消代課</button>
              </div>
            </div>
          ))}
          {records.length === 0 && <div className="py-8 text-center text-slate-400">尚無代課紀錄</div>}
        </div>

        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[1080px] text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-5 py-3 text-left font-semibold">日期</th>
                <th className="px-5 py-3 text-left font-semibold">園所／課程</th>
                <th className="px-5 py-3 text-left font-semibold">時間</th>
                <th className="px-5 py-3 text-left font-semibold">身份</th>
                <th className="px-5 py-3 text-left font-semibold">原老師</th>
                <th className="px-5 py-3 text-left font-semibold">代課老師</th>
                <th className="px-5 py-3 text-left font-semibold">資料狀態</th>
                <th className="px-5 py-3 text-left font-semibold">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {records.map((record) => (
                <tr key={record.id} className="hover:bg-slate-50/70">
                  <td className="whitespace-nowrap px-5 py-4 text-slate-700">{record.date.slice(0, 10)}</td>
                  <td className="px-5 py-4">
                    <div className="font-medium text-slate-800">{record.school}</div>
                    <div className="mt-1 text-xs text-slate-500">{courseLabel(record.courseType)}</div>
                  </td>
                  <td className="whitespace-nowrap px-5 py-4 text-slate-700">{record.time || "-"}</td>
                  <td className="px-5 py-4 text-slate-700">{record.role ?? "主教"}</td>
                  <td className="px-5 py-4 font-medium text-orange-700">{record.originalTeacher.name}</td>
                  <td className="px-5 py-4 font-medium text-blue-700">{record.substituteTeacher?.name ?? "-"}</td>
                  <td className="px-5 py-4">
                    <RecordSource record={record} />
                    <button onClick={() => toggleConfirmed(record)} className="ml-2 text-xs font-medium text-emerald-700">{record.confirmed ? "已通知" : "未通知"}</button>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex gap-4 whitespace-nowrap">
                      <button onClick={() => edit(record)} className="font-medium text-blue-600">編輯</button>
                      <button onClick={() => del(record)} className="font-medium text-red-500">取消代課</button>
                    </div>
                  </td>
                </tr>
              ))}
              {records.length === 0 && <tr><td colSpan={8} className="py-8 text-center text-slate-400">尚無代課紀錄</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function RecordSource({ record }: { record: Substitute }) {
  if (record.source === "linked") return <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">已同步出勤</span>;
  if (record.source === "attendance") return <span className="rounded-full bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700">出勤既有代課</span>;
  return <span className="rounded-full bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700">舊資料待配對</span>;
}
