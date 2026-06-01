"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { SaveButton } from "@/components/SaveButton";
import { Toast } from "@/components/Toast";
import { ensureOk } from "@/lib/clientApi";
import { DEPARTMENT_OPTIONS, normalizeDepartment, normalizeRegion, REGION_OPTIONS } from "@/lib/courseMeta";
import { useToast } from "@/lib/useToast";
import { useScrollToFormOnEdit } from "@/lib/useScrollToFormOnEdit";

type School = { id: number; name: string; type: string; region: string; address: string; phone: string; contact: string; notes: string; lineUserId: string | null };
type PageResult<T> = { items: T[]; total: number; page: number; pageSize: number };

const empty: Omit<School, "id"> = { name: "", type: "", region: "", address: "", phone: "", contact: "", notes: "", lineUserId: "" };

export default function SchoolsPage() {
  const [schools, setSchools] = useState<School[]>([]);
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState<number | null>(null);
  const [filterRegion, setFilterRegion] = useState("");
  const [filterType, setFilterType] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 20;
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const { toast, showToast } = useToast();
  const formRef = useRef<HTMLDivElement | null>(null);
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const scrollToFormOnEdit = useScrollToFormOnEdit(formRef, nameInputRef);

  const fetchSchools = useCallback(async () => {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (filterRegion) params.set("region", filterRegion);
    if (filterType) params.set("type", filterType);
    if (search.trim()) params.set("search", search.trim());
    const res = await fetch(`/api/schools?${params}`);
    const data = await res.json() as PageResult<School>;
    setSchools(data.items);
    setTotal(data.total);
  }, [filterRegion, filterType, page, search]);

  useEffect(() => {
    void Promise.resolve().then(fetchSchools);
  }, [fetchSchools]);

  async function save() {
    if (!form.name) return;
    if (saving) return;
    setSaving(true);
    try {
      if (editing != null) {
        const res = await fetch(`/api/schools/${editing}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
        await ensureOk(res, "園所資料儲存失敗");
      } else {
        const res = await fetch("/api/schools", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
        await ensureOk(res, "園所資料新增失敗");
      }
      setForm(empty);
      setEditing(null);
      setShowForm(false);
      fetchSchools();
      showToast("success", "園所資料已儲存");
    } catch (e) {
      showToast("error", (e as Error).message || "園所資料儲存失敗", 3000);
    } finally {
      setSaving(false);
    }
  }

  async function del(id: number) {
    if (!confirm("確定刪除此園所？")) return;
    await fetch(`/api/schools/${id}`, { method: "DELETE" });
    fetchSchools();
  }

  async function copyPortalLink(id: number) {
    try {
      const res = await fetch(`/api/schools/${id}/portal-link`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "園所端連結產生失敗");
      await navigator.clipboard.writeText(data.url);
      showToast("success", "園所端連結已複製");
    } catch (e) {
      showToast("error", (e as Error).message || "園所端連結產生失敗", 3000);
    }
  }

  function edit(s: School) {
    setForm({ name: s.name, type: s.type ? normalizeDepartment(s.type) : "", region: normalizeRegion(s.region), address: s.address, phone: s.phone, contact: s.contact, notes: s.notes, lineUserId: s.lineUserId ?? "" });
    setEditing(s.id);
    setShowForm(true);
    scrollToFormOnEdit();
  }

  const filtered = schools;
  const regionGroups = [...new Set(schools.map((s) => normalizeRegion(s.region)).filter(Boolean))].sort();
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <Toast toast={toast} />
      <div className="flex items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-800">園所管理</h1>
          <p className="mt-1 text-sm text-slate-500">共 {total} 間，目前顯示 {filtered.length} 間</p>
        </div>
        <button onClick={() => { setForm(empty); setEditing(null); setShowForm(true); }} className="bg-blue-600 text-white px-4 py-3 md:py-2 rounded-lg text-sm hover:bg-blue-700 whitespace-nowrap">+ 新增園所</button>
      </div>

      {showForm && (
        <div ref={formRef} className={`bg-white border rounded-xl p-4 md:p-6 mb-6 shadow-sm ${editing != null ? "border-blue-200 ring-2 ring-blue-50" : ""}`}>
          <h2 className="font-semibold text-gray-700 mb-4">{editing != null ? "正在編輯園所" : "新增園所"}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">園所名稱 *</label>
              <input ref={nameInputRef} className="w-full border rounded-lg px-3 py-2 text-sm" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">地區</label>
              <select className="w-full border rounded-lg px-3 py-2 text-sm" value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })}>
                <option value="">選擇地區</option>
                {REGION_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">園所類型</label>
              <select className="w-full border rounded-lg px-3 py-2 text-sm" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                <option value="">未分類</option>
                {DEPARTMENT_OPTIONS.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">地址</label>
              <input className="w-full border rounded-lg px-3 py-2 text-sm" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">電話</label>
              <input className="w-full border rounded-lg px-3 py-2 text-sm" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">聯絡人</label>
              <input className="w-full border rounded-lg px-3 py-2 text-sm" value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} />
            </div>
            <div className="md:col-span-2">
              <label className="text-xs text-gray-500 mb-1 block">備註</label>
              <input className="w-full border rounded-lg px-3 py-2 text-sm" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
            <div className="md:col-span-2">
              <label className="text-xs text-gray-500 mb-1 block">LINE User ID（可手動貼上）</label>
              <input className="w-full border rounded-lg px-3 py-2 text-sm font-mono" value={form.lineUserId ?? ""} onChange={(e) => setForm({ ...form, lineUserId: e.target.value })} placeholder="Uxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" />
              <p className="mt-1 text-xs text-slate-400">若園所已用綁定碼綁定，這裡會自動帶入；你也可以直接貼既有 User ID。</p>
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <SaveButton saving={saving} onClick={save} className="px-6" />
            <button disabled={saving} onClick={() => { setShowForm(false); setEditing(null); setForm(empty); }} className="bg-gray-100 text-gray-700 px-6 py-3 md:py-2 rounded-lg text-sm hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-60">取消</button>
          </div>
        </div>
      )}

      <div className="mb-4 grid gap-3 rounded-xl border border-slate-200 bg-white p-3 md:grid-cols-[1fr_auto]">
        <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="搜尋園所、地址、電話或聯絡人" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <button disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="rounded-lg border border-slate-200 bg-white px-3 py-2 disabled:opacity-40">上一頁</button>
          <span>第 {page} / {totalPages} 頁</span>
          <button disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} className="rounded-lg border border-slate-200 bg-white px-3 py-2 disabled:opacity-40">下一頁</button>
        </div>
      </div>

      <div className="flex gap-2 mb-4 overflow-x-auto pb-1 md:flex-wrap">
        <button onClick={() => { setFilterType(""); setPage(1); }} className={`shrink-0 px-3 py-2 md:py-1 rounded-full text-sm border ${!filterType ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600"}`}>全部類型</button>
        {[...DEPARTMENT_OPTIONS, "未分類"].map((t) => (
          <button key={t} onClick={() => { setFilterType(t); setPage(1); }} className={`shrink-0 px-3 py-2 md:py-1 rounded-full text-sm border ${filterType === t ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600"}`}>{t}</button>
        ))}
      </div>
      <div className="flex gap-2 mb-4 overflow-x-auto pb-1 md:flex-wrap">
        <button onClick={() => { setFilterRegion(""); setPage(1); }} className={`shrink-0 px-3 py-2 md:py-1 rounded-full text-sm border ${!filterRegion ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600"}`}>全部地區</button>
        {[...new Set([...REGION_OPTIONS, ...regionGroups])].map((r) => (
          <button key={r} onClick={() => { setFilterRegion(r); setPage(1); }} className={`shrink-0 px-3 py-2 md:py-1 rounded-full text-sm border ${filterRegion === r ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600"}`}>{r}</button>
        ))}
      </div>

      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="divide-y divide-slate-100 md:hidden">
          {filtered.map((s) => (
            <div key={s.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold text-slate-900">{s.name}</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs text-emerald-700">{s.type ? normalizeDepartment(s.type) : "未分類"}</span>
                    <span className="rounded-full bg-blue-100 px-2 py-1 text-xs text-blue-700">{normalizeRegion(s.region) || "—"}</span>
                  </div>
                </div>
                <div className="flex shrink-0 gap-3">
                  <button onClick={() => copyPortalLink(s.id)} className="text-sm font-medium text-emerald-600">連結</button>
                  <button onClick={() => edit(s)} className="text-sm font-medium text-blue-600">編輯</button>
                  <button onClick={() => del(s.id)} className="text-sm font-medium text-red-500">刪除</button>
                </div>
              </div>
              <div className="mt-3 space-y-1 text-sm text-slate-500">
                {s.address && <div>{s.address}</div>}
                {(s.phone || s.contact) && <div>{s.contact || "聯絡人未填"}{s.phone ? ` · ${s.phone}` : ""}</div>}
                <div className={s.lineUserId ? "text-xs text-green-600" : "text-xs text-slate-400"}>LINE：{s.lineUserId ? "已綁定" : "未綁定"}</div>
                {s.notes && <div className="text-xs">{s.notes}</div>}
              </div>
            </div>
          ))}
          {filtered.length === 0 && <div className="py-8 text-center text-gray-400">尚無園所資料</div>}
        </div>
        <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="text-left px-4 py-3 font-medium">園所名稱</th>
              <th className="text-left px-4 py-3 font-medium">類型</th>
              <th className="text-left px-4 py-3 font-medium">地區</th>
              <th className="text-left px-4 py-3 font-medium">地址</th>
              <th className="text-left px-4 py-3 font-medium">電話</th>
              <th className="text-left px-4 py-3 font-medium">聯絡人</th>
              <th className="text-left px-4 py-3 font-medium">LINE</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.map((s) => (
              <tr key={s.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium">{s.name}</td>
                <td className="px-4 py-3"><span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full text-xs">{s.type ? normalizeDepartment(s.type) : "未分類"}</span></td>
                <td className="px-4 py-3"><span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full text-xs">{normalizeRegion(s.region) || "—"}</span></td>
                <td className="px-4 py-3 text-gray-500">{s.address || "—"}</td>
                <td className="px-4 py-3 text-gray-500">{s.phone || "—"}</td>
                <td className="px-4 py-3 text-gray-500">{s.contact || "—"}</td>
                <td className="px-4 py-3">
                  {s.lineUserId
                    ? <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">已綁定</span>
                    : <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">未綁定</span>}
                </td>
                <td className="px-4 py-3 text-right space-x-2">
                  <button onClick={() => copyPortalLink(s.id)} className="text-emerald-600 hover:underline text-xs">複製園所端連結</button>
                  <button onClick={() => edit(s)} className="text-blue-600 hover:underline text-xs">編輯</button>
                  <button onClick={() => del(s.id)} className="text-red-500 hover:underline text-xs">刪除</button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={8} className="text-center py-8 text-gray-400">尚無園所資料</td></tr>
            )}
          </tbody>
        </table>
        </div>
      </div>
      <p className="text-xs text-gray-400 mt-3">本頁 {filtered.length} 間園所</p>
    </div>
  );
}
