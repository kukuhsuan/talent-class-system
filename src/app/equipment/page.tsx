"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { SaveButton } from "@/components/SaveButton";
import { Toast } from "@/components/Toast";
import { ensureOk } from "@/lib/clientApi";
import { DEPARTMENTS } from "@/lib/departmentContext";
import { useScrollToFormOnEdit } from "@/lib/useScrollToFormOnEdit";
import { useToast } from "@/lib/useToast";

type SchoolOption = {
  id: number;
  name: string;
  type?: string;
  region?: string;
};

type EquipmentRow = {
  id: number;
  schoolId: number | null;
  school: string;
  name: string;
  quantity: string;
  status: string;
  notes: string;
  sortOrder: number;
  isActive: boolean;
};

type EquipmentForm = {
  id: number;
  schoolId: string;
  name: string;
  quantity: string;
  status: string;
  notes: string;
  sortOrder: string;
};

const STATUS_OPTIONS = ["正常", "需補充", "損壞", "遺失"];
const EMPTY_FORM: EquipmentForm = {
  id: 0,
  schoolId: "",
  name: "",
  quantity: "",
  status: "正常",
  notes: "",
  sortOrder: "0",
};

export default function EquipmentPage() {
  const [schools, setSchools] = useState<SchoolOption[]>([]);
  const [rows, setRows] = useState<EquipmentRow[]>([]);
  const [form, setForm] = useState<EquipmentForm>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [schoolFilter, setSchoolFilter] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const { toast, showToast } = useToast();
  const formRef = useRef<HTMLDivElement | null>(null);
  const firstInputRef = useRef<HTMLSelectElement | null>(null);
  const scrollToFormOnEdit = useScrollToFormOnEdit(formRef, firstInputRef);

  useEffect(() => {
    loadInitialData();
  }, []);

  const schoolMap = useMemo(() => {
    return new Map(schools.map((school) => [school.id, school]));
  }, [schools]);

  const selectedSchool = form.schoolId ? schoolMap.get(Number(form.schoolId)) : null;

  const departmentOptions = useMemo(() => {
    const values = new Set<string>([...DEPARTMENTS, "未分類"]);
    schools.forEach((school) => {
      if (school.type) values.add(school.type);
    });
    return Array.from(values);
  }, [schools]);

  const filteredRows = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return rows.filter((row) => {
      const rowSchool = getRowSchool(row);
      const department = rowSchool?.type || "未分類";
      const schoolName = rowSchool?.name || row.school || "未指定園所";
      const text = `${schoolName} ${department} ${row.name} ${row.quantity} ${row.status} ${row.notes}`.toLowerCase();
      if (keyword && !text.includes(keyword)) return false;
      if (schoolFilter && String(rowSchool?.id ?? row.schoolId ?? "") !== schoolFilter) return false;
      if (departmentFilter && department !== departmentFilter) return false;
      if (statusFilter && row.status !== statusFilter) return false;
      return true;
    });
  }, [rows, search, schoolFilter, departmentFilter, statusFilter, schoolMap]);

  function getRowSchool(row: EquipmentRow) {
    return row.schoolId ? schoolMap.get(row.schoolId) : schools.find((school) => school.name === row.school);
  }

  async function loadInitialData() {
    setLoading(true);
    try {
      const [schoolsRes, equipmentRes] = await Promise.all([
        fetch("/api/schools?minimal=1"),
        fetch("/api/equipment-status"),
      ]);
      await Promise.all([
        ensureOk(schoolsRes, "讀取園所資料失敗"),
        ensureOk(equipmentRes, "讀取器材資料失敗"),
      ]);
      const [schoolData, equipmentData] = await Promise.all([
        schoolsRes.json() as Promise<SchoolOption[]>,
        equipmentRes.json() as Promise<EquipmentRow[]>,
      ]);
      setSchools(schoolData);
      setRows(equipmentData);
      if (!form.schoolId && schoolData[0]) {
        setForm((prev) => ({ ...prev, schoolId: String(schoolData[0].id) }));
      }
    } catch (error) {
      showToast("error", error instanceof Error ? error.message : "讀取器材資料失敗");
    } finally {
      setLoading(false);
    }
  }

  async function loadEquipmentRows() {
    const res = await fetch("/api/equipment-status");
    await ensureOk(res, "讀取器材資料失敗");
    const data = await res.json() as EquipmentRow[];
    setRows(data);
  }

  async function saveEquipment() {
    if (saving) return;
    const school = form.schoolId ? schoolMap.get(Number(form.schoolId)) : null;
    if (!school) {
      showToast("error", "請選擇園所");
      return;
    }
    if (!form.name.trim()) {
      showToast("error", "請填寫器材名稱");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        schoolId: school.id,
        school: school.name,
        name: form.name.trim(),
        quantity: form.quantity.trim(),
        status: form.status,
        notes: form.notes.trim(),
        sortOrder: Number(form.sortOrder || 0),
      };
      const url = form.id ? `/api/equipment-status/${form.id}` : "/api/equipment-status";
      const res = await fetch(url, {
        method: form.id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      await ensureOk(res, "儲存器材資料失敗");
      await loadEquipmentRows();
      setForm({ ...EMPTY_FORM, schoolId: String(school.id) });
      showToast("success", form.id ? "器材資料已更新" : "器材資料已新增");
    } catch (error) {
      showToast("error", error instanceof Error ? error.message : "儲存器材資料失敗");
    } finally {
      setSaving(false);
    }
  }

  function editEquipment(row: EquipmentRow) {
    const rowSchool = getRowSchool(row);
    setForm({
      id: row.id,
      schoolId: String(rowSchool?.id ?? row.schoolId ?? ""),
      name: row.name,
      quantity: row.quantity,
      status: STATUS_OPTIONS.includes(row.status) ? row.status : "正常",
      notes: row.notes,
      sortOrder: String(row.sortOrder ?? 0),
    });
    scrollToFormOnEdit();
  }

  async function deleteEquipment(row: EquipmentRow) {
    if (!window.confirm(`確定要刪除「${row.name}」嗎？刪除後不會顯示在器材管理。`)) return;
    try {
      const res = await fetch(`/api/equipment-status/${row.id}`, { method: "DELETE" });
      await ensureOk(res, "刪除器材資料失敗");
      setRows((prev) => prev.filter((item) => item.id !== row.id));
      showToast("success", "器材資料已刪除");
    } catch (error) {
      showToast("error", error instanceof Error ? error.message : "刪除器材資料失敗");
    }
  }

  function statusBadge(status: string) {
    const styles: Record<string, string> = {
      正常: "bg-emerald-50 text-emerald-700 border-emerald-200",
      需補充: "bg-amber-50 text-amber-700 border-amber-200",
      損壞: "bg-red-50 text-red-700 border-red-200",
      遺失: "bg-rose-50 text-rose-700 border-rose-200",
    };
    return styles[status] ?? "bg-slate-50 text-slate-600 border-slate-200";
  }

  function equipmentIcon(name: string) {
    if (/足球|球/.test(name)) return "⚽";
    if (/高爾夫|桿/.test(name)) return "⛳";
    if (/冰壺/.test(name)) return "🥌";
    if (/籃球/.test(name)) return "🏀";
    if (/棒球/.test(name)) return "⚾";
    return "🎒";
  }

  return (
    <div className="space-y-6">
      <Toast toast={toast} />

      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">器材管理</h1>
          <p className="mt-1 text-sm text-slate-500">內部行政與老師維護器材數量、狀態與備註。</p>
        </div>
        <div className="rounded-full bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700">
          共 {filteredRows.length} 筆
        </div>
      </div>

      <section ref={formRef} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-5 flex flex-col gap-1">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-600">
            {form.id ? "正在編輯" : "新增器材"}
          </p>
          <h2 className="text-lg font-bold text-slate-900">
            {form.id ? `編輯：${form.name}` : "新增器材狀況"}
          </h2>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <label className="space-y-2">
            <span className="text-sm font-semibold text-slate-700">園所</span>
            <select
              ref={firstInputRef}
              value={form.schoolId}
              onChange={(event) => setForm((prev) => ({ ...prev, schoolId: event.target.value }))}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            >
              <option value="">請選擇園所</option>
              {schools.map((school) => (
                <option key={school.id} value={school.id}>
                  {school.name}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2">
            <span className="text-sm font-semibold text-slate-700">部門</span>
            <input
              value={selectedSchool?.type || "未分類"}
              readOnly
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-600"
            />
          </label>

          <label className="space-y-2">
            <span className="text-sm font-semibold text-slate-700">器材名稱</span>
            <input
              value={form.name}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              placeholder="例如：足球、高爾夫球桿"
              className="w-full rounded-xl border border-slate-200 px-3 py-3 text-sm text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
          </label>

          <label className="space-y-2">
            <span className="text-sm font-semibold text-slate-700">數量</span>
            <input
              value={form.quantity}
              onChange={(event) => setForm((prev) => ({ ...prev, quantity: event.target.value }))}
              placeholder="例如：10、24 支、5 組"
              className="w-full rounded-xl border border-slate-200 px-3 py-3 text-sm text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
          </label>

          <label className="space-y-2">
            <span className="text-sm font-semibold text-slate-700">狀態</span>
            <select
              value={form.status}
              onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value }))}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            >
              {STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2">
            <span className="text-sm font-semibold text-slate-700">排序</span>
            <input
              type="number"
              value={form.sortOrder}
              onChange={(event) => setForm((prev) => ({ ...prev, sortOrder: event.target.value }))}
              className="w-full rounded-xl border border-slate-200 px-3 py-3 text-sm text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
          </label>

          <label className="space-y-2 md:col-span-2">
            <span className="text-sm font-semibold text-slate-700">備註</span>
            <input
              value={form.notes}
              onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
              placeholder="例如：部分球桿磨損，下次補充"
              className="w-full rounded-xl border border-slate-200 px-3 py-3 text-sm text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
          </label>
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <SaveButton saving={saving} onClick={saveEquipment} idleText={form.id ? "更新器材" : "新增器材"} />
          {form.id > 0 && (
            <button
              type="button"
              onClick={() => setForm({ ...EMPTY_FORM, schoolId: form.schoolId })}
              className="rounded-lg border border-slate-200 px-4 py-3 text-sm font-medium text-slate-600 hover:bg-slate-50 md:py-2"
            >
              取消編輯
            </button>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 p-4">
          <div className="grid gap-3 md:grid-cols-4">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="搜尋園所、器材、備註"
              className="rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
            <select
              value={schoolFilter}
              onChange={(event) => setSchoolFilter(event.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            >
              <option value="">全部園所</option>
              {schools.map((school) => (
                <option key={school.id} value={school.id}>
                  {school.name}
                </option>
              ))}
            </select>
            <select
              value={departmentFilter}
              onChange={(event) => setDepartmentFilter(event.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            >
              <option value="">全部部門</option>
              {departmentOptions.map((department) => (
                <option key={department} value={department}>
                  {department}
                </option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            >
              <option value="">全部狀態</option>
              {STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-5 py-4 font-semibold">園所</th>
                <th className="px-5 py-4 font-semibold">部門</th>
                <th className="px-5 py-4 font-semibold">器材名稱</th>
                <th className="px-5 py-4 font-semibold">數量</th>
                <th className="px-5 py-4 font-semibold">狀態</th>
                <th className="px-5 py-4 font-semibold">備註</th>
                <th className="px-5 py-4 font-semibold">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-slate-400">讀取中...</td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-slate-400">尚無器材資料</td>
                </tr>
              ) : filteredRows.map((row) => {
                const rowSchool = getRowSchool(row);
                return (
                  <tr key={row.id} className="align-top hover:bg-slate-50/60">
                    <td className="px-5 py-4 font-semibold text-slate-900">{rowSchool?.name || row.school || "未指定園所"}</td>
                    <td className="px-5 py-4 text-slate-600">{rowSchool?.type || "未分類"}</td>
                    <td className="px-5 py-4 font-semibold text-slate-900">
                      <span className="mr-2">{equipmentIcon(row.name)}</span>{row.name}
                    </td>
                    <td className="px-5 py-4 text-slate-700">{row.quantity || "未填"}</td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${statusBadge(row.status)}`}>
                        {row.status}
                      </span>
                    </td>
                    <td className="max-w-md px-5 py-4 text-slate-600">{row.notes || "-"}</td>
                    <td className="px-5 py-4">
                      <div className="flex gap-3">
                        <button type="button" onClick={() => editEquipment(row)} className="font-semibold text-blue-600 hover:text-blue-700">編輯</button>
                        <button type="button" onClick={() => deleteEquipment(row)} className="font-semibold text-red-500 hover:text-red-600">刪除</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="grid gap-3 p-4 md:hidden">
          {loading ? (
            <p className="py-8 text-center text-sm text-slate-400">讀取中...</p>
          ) : filteredRows.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">尚無器材資料</p>
          ) : filteredRows.map((row) => {
            const rowSchool = getRowSchool(row);
            return (
              <article key={row.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold text-slate-500">{rowSchool?.name || row.school || "未指定園所"} · {rowSchool?.type || "未分類"}</p>
                    <h3 className="mt-1 text-lg font-bold text-slate-900">{equipmentIcon(row.name)} {row.name}</h3>
                  </div>
                  <span className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold ${statusBadge(row.status)}`}>
                    {row.status}
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                  <div className="rounded-xl bg-white p-3">
                    <p className="text-xs text-slate-400">數量</p>
                    <p className="mt-1 font-semibold text-slate-800">{row.quantity || "未填"}</p>
                  </div>
                  <div className="rounded-xl bg-white p-3">
                    <p className="text-xs text-slate-400">備註</p>
                    <p className="mt-1 font-semibold text-slate-800">{row.notes || "-"}</p>
                  </div>
                </div>
                <div className="mt-4 flex gap-3">
                  <button type="button" onClick={() => editEquipment(row)} className="flex-1 rounded-xl bg-blue-600 px-3 py-3 text-sm font-semibold text-white">編輯</button>
                  <button type="button" onClick={() => deleteEquipment(row)} className="flex-1 rounded-xl border border-red-200 bg-white px-3 py-3 text-sm font-semibold text-red-500">刪除</button>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
