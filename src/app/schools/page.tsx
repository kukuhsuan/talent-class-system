"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { SaveButton } from "@/components/SaveButton";
import { Toast } from "@/components/Toast";
import { ensureOk } from "@/lib/clientApi";
import { DEPARTMENT_OPTIONS, normalizeDepartment, normalizeRegion, REGION_OPTIONS } from "@/lib/courseMeta";
import { useToast } from "@/lib/useToast";
import { useScrollToFormOnEdit } from "@/lib/useScrollToFormOnEdit";

type CourseConfirmation = {
  toddlerClassCount?: string;
  smallClassCount?: string;
  middleClassCount?: string;
  bigClassCount?: string;
  location?: string;
  otherLocation?: string;
  rainyLocation?: string;
  teachingStyles?: string[];
  classNotes?: string;
  otherReminders?: string;
  submittedAt?: string | null;
  reopenedAt?: string | null;
  canSchoolEdit?: boolean;
};
type School = {
  id: number; name: string; type: string; region: string; address: string; phone: string; contact: string; notes: string; lineUserId: string | null;
  courseConfirmation?: CourseConfirmation;
  courseConfirmationSummary?: string;
  confirmationTerm?: { academicYear: number; semester: string; label: string };
};
type PageResult<T> = { items: T[]; total: number; page: number; pageSize: number };

const EMPTY_CONFIRMATION: CourseConfirmation = {
  toddlerClassCount: "",
  smallClassCount: "",
  middleClassCount: "",
  bigClassCount: "",
  location: "",
  otherLocation: "",
  rainyLocation: "",
  teachingStyles: [],
  classNotes: "",
  otherReminders: "",
};
const empty: Omit<School, "id" | "courseConfirmationSummary"> = { name: "", type: "", region: "", address: "", phone: "", contact: "", notes: "", lineUserId: "", courseConfirmation: EMPTY_CONFIRMATION };
const LOCATION_OPTIONS = ["教室", "禮堂 / 活動中心", "操場", "其他"];
const TEACHING_STYLE_OPTIONS = ["活潑互動", "注重秩序", "依班級狀況調整"];

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
  const [authSchool, setAuthSchool] = useState<{ id: number; name: string } | null>(null);
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

  async function rotatePortalLink(id: number) {
    if (!confirm("重新產生園所端連結後，舊連結會立即失效。確定要繼續？")) return;
    try {
      const res = await fetch(`/api/schools/${id}/portal-link`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "園所端連結重新產生失敗");
      await navigator.clipboard.writeText(data.url);
      showToast("success", "新園所端連結已產生並複製，舊連結已失效");
    } catch (e) {
      showToast("error", (e as Error).message || "園所端連結重新產生失敗", 3000);
    }
  }

  async function copyPreviousConfirmation() {
    if (editing == null) return;
    try {
      const res = await fetch(`/api/schools/${editing}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "copyPrevious" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "複製上一學期失敗");
      setForm((current) => ({ ...current, courseConfirmation: { ...EMPTY_CONFIRMATION, ...(data.courseConfirmation ?? {}) } }));
      showToast("success", "已複製上一學期開課確認，可再微調後儲存");
    } catch (e) {
      showToast("error", (e as Error).message || "複製上一學期失敗", 3000);
    }
  }

  async function reopenConfirmation() {
    if (editing == null) return;
    if (!confirm("重新開放後，園所端可以再次修改並重新送出。確定要開放嗎？")) return;
    try {
      const res = await fetch(`/api/schools/${editing}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reopenConfirmation" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "重新開放失敗");
      setForm((current) => ({ ...current, courseConfirmation: { ...EMPTY_CONFIRMATION, ...(data.courseConfirmation ?? {}) } }));
      void fetchSchools();
      showToast("success", "已重新開放園所填寫");
    } catch (e) {
      showToast("error", (e as Error).message || "重新開放失敗", 3000);
    }
  }

  async function resetConfirmation() {
    if (editing == null) return;
    if (!confirm("這會清空目前學期的開課前確認表，園所端會重新變成空白可填。確定清空？")) return;
    try {
      const res = await fetch(`/api/schools/${editing}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resetConfirmation" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "清空失敗");
      setForm((current) => ({ ...current, courseConfirmation: { ...EMPTY_CONFIRMATION, ...(data.courseConfirmation ?? {}) } }));
      void fetchSchools();
      showToast("success", "已清空開課前確認表，園所可重新填寫");
    } catch (e) {
      showToast("error", (e as Error).message || "清空失敗", 3000);
    }
  }

  function edit(s: School) {
    setForm({ name: s.name, type: s.type ? normalizeDepartment(s.type) : "", region: normalizeRegion(s.region), address: s.address, phone: s.phone, contact: s.contact, notes: s.notes, lineUserId: s.lineUserId ?? "", courseConfirmation: { ...EMPTY_CONFIRMATION, ...(s.courseConfirmation ?? {}) } });
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
        <button onClick={() => { setForm({ ...empty, courseConfirmation: { ...EMPTY_CONFIRMATION } }); setEditing(null); setShowForm(true); }} className="bg-blue-600 text-white px-4 py-3 md:py-2 rounded-lg text-sm hover:bg-blue-700 whitespace-nowrap">+ 新增園所</button>
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
            <div className="md:col-span-2">
              <SchoolConfirmationEditor
                value={form.courseConfirmation ?? EMPTY_CONFIRMATION}
                onChange={(courseConfirmation) => setForm({ ...form, courseConfirmation })}
                onCopyPrevious={editing == null ? undefined : copyPreviousConfirmation}
                onReopen={editing == null ? undefined : reopenConfirmation}
                onReset={editing == null ? undefined : resetConfirmation}
              />
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <SaveButton saving={saving} onClick={save} className="px-6" />
            <button disabled={saving} onClick={() => { setShowForm(false); setEditing(null); setForm({ ...empty, courseConfirmation: { ...EMPTY_CONFIRMATION } }); }} className="bg-gray-100 text-gray-700 px-6 py-3 md:py-2 rounded-lg text-sm hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-60">取消</button>
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
                  <a href={`/ratings?school=${encodeURIComponent(s.name)}`} className="text-sm font-medium text-amber-600">評分</a>
                  <button onClick={() => copyPortalLink(s.id)} className="text-sm font-medium text-emerald-600">連結</button>
                  <button onClick={() => rotatePortalLink(s.id)} className="text-sm font-medium text-amber-600">重生</button>
                  <button onClick={() => edit(s)} className="text-sm font-medium text-blue-600">編輯</button>
                  <button onClick={() => del(s.id)} className="text-sm font-medium text-red-500">刪除</button>
                </div>
              </div>
              <div className="mt-3 space-y-1 text-sm text-slate-500">
                {s.address && <div>{s.address}</div>}
                {(s.phone || s.contact) && <div>{s.contact || "聯絡人未填"}{s.phone ? ` · ${s.phone}` : ""}</div>}
                <div className={s.lineUserId ? "text-xs text-green-600" : "text-xs text-slate-400"}>LINE：{s.lineUserId ? "已綁定" : "未綁定"}</div>
                {s.notes && <div className="text-xs">{s.notes}</div>}
                {s.courseConfirmationSummary && <div className="rounded-lg bg-slate-50 p-2 text-xs leading-5 text-slate-600">{s.courseConfirmationSummary}</div>}
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
              <th className="text-left px-4 py-3 font-medium">開課確認</th>
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
                <td className="px-4 py-3 text-xs leading-5 text-slate-500">{s.courseConfirmationSummary || "—"}</td>
                <td className="px-4 py-3">
                  {s.lineUserId
                    ? <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">已綁定</span>
                    : <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">未綁定</span>}
                </td>
                <td className="px-4 py-3 text-right space-x-2">
                  <a href={`/ratings?school=${encodeURIComponent(s.name)}`} className="text-amber-600 hover:underline text-xs">歷史評分</a>
                  <button onClick={() => setAuthSchool({ id: s.id, name: s.name })} className="text-indigo-600 hover:underline text-xs">驗證碼</button>
                  <button onClick={() => copyPortalLink(s.id)} className="text-emerald-600 hover:underline text-xs">複製園所端連結</button>
                  <button onClick={() => rotatePortalLink(s.id)} className="text-amber-600 hover:underline text-xs">重生連結</button>
                  <button onClick={() => edit(s)} className="text-blue-600 hover:underline text-xs">編輯</button>
                  <button onClick={() => del(s.id)} className="text-red-500 hover:underline text-xs">刪除</button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={9} className="text-center py-8 text-gray-400">尚無園所資料</td></tr>
            )}
          </tbody>
        </table>
        </div>
      </div>
      <p className="text-xs text-gray-400 mt-3">本頁 {filtered.length} 間園所</p>
      {authSchool && <PortalAuthModal school={authSchool} onClose={() => setAuthSchool(null)} />}
    </div>
  );
}

// 園所驗證碼管理（安親班）：產生／停用／登出所有裝置＋狀態顯示
function PortalAuthModal({ school, onClose }: { school: { id: number; name: string }; onClose: () => void }) {
  const [status, setStatus] = useState<{ enabled: boolean; lastVerifiedAt: string | null; failCount: number; lockedUntil: string | null } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/schools/${school.id}/portal-auth`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "載入失敗");
      setStatus(data);
    } catch (e) { setError((e as Error).message); }
  }, [school.id]);
  useEffect(() => { load(); }, [load]);

  async function act(action: "generate" | "disable" | "logoutAll") {
    if (action === "generate" && status?.enabled && !confirm("產生新驗證碼後，舊驗證碼會立即失效。確定要繼續？")) return;
    if (action === "disable" && !confirm("停用後園所將無法送出評分與異動申請。確定要停用？")) return;
    setBusy(true); setError("");
    try {
      const res = await fetch(`/api/schools/${school.id}/portal-auth`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "操作失敗");
      if (action === "generate") setCode(String(data.code ?? ""));
      if (action === "disable") setCode("");
      await load();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  const locked = status?.lockedUntil && new Date(status.lockedUntil + "Z") > new Date();
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-bold text-gray-800">園所驗證碼管理｜{school.name}</h3>
        <p className="mt-1 text-xs text-gray-400">園所首次送出評分或異動申請時，需輸入 6 位數驗證碼。</p>
        {status && (
          <div className="mt-3 space-y-1 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
            <p>狀態：{status.enabled ? <span className="font-bold text-emerald-600">已啟用</span> : <span className="font-bold text-slate-400">未啟用</span>}{locked ? <span className="ml-2 font-bold text-red-600">已鎖定 15 分鐘</span> : null}</p>
            <p>最近驗證成功：{status.lastVerifiedAt ? new Date(status.lastVerifiedAt + "Z").toLocaleString("zh-TW") : "—"}</p>
            <p>連續失敗次數：{status.failCount}</p>
          </div>
        )}
        {code && (
          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-center">
            <p className="text-xs font-bold text-amber-700">新驗證碼（只顯示這一次，請立即提供給園所）</p>
            <p className="mt-1 text-3xl font-black tracking-[0.3em] text-gray-800">{code}</p>
            <button onClick={() => { navigator.clipboard.writeText(`${school.name} 園所驗證碼：${code}（送出評分或異動申請時輸入）`); }} className="mt-2 text-xs font-bold text-indigo-600 underline">複製通知文字</button>
          </div>
        )}
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        <div className="mt-4 grid gap-2">
          <button disabled={busy} onClick={() => act("generate")} className="rounded-xl bg-indigo-600 py-2.5 text-sm font-bold text-white disabled:opacity-50">{status?.enabled ? "重新產生驗證碼" : "產生驗證碼"}</button>
          {status?.enabled && <button disabled={busy} onClick={() => act("logoutAll")} className="rounded-xl border border-slate-200 py-2.5 text-sm font-bold text-slate-600 disabled:opacity-50">登出所有已驗證裝置</button>}
          {status?.enabled && <button disabled={busy} onClick={() => act("disable")} className="rounded-xl border border-red-200 py-2.5 text-sm font-bold text-red-600 disabled:opacity-50">停用驗證碼</button>}
          <button onClick={onClose} className="rounded-xl py-2 text-sm text-slate-400">關閉</button>
        </div>
      </div>
    </div>
  );
}

function SchoolConfirmationEditor({ value, onChange, onCopyPrevious, onReopen, onReset }: { value: CourseConfirmation; onChange: (value: CourseConfirmation) => void; onCopyPrevious?: () => void; onReopen?: () => void; onReset?: () => void }) {
  const update = (patch: Partial<CourseConfirmation>) => onChange({ ...value, ...patch });
  const toggleStyle = (style: string) => {
    const current = value.teachingStyles ?? [];
    update({ teachingStyles: current.includes(style) ? current.filter((item) => item !== style) : [...current, style] });
  };
  const locked = value.canSchoolEdit === false;
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="mb-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="text-sm font-semibold text-slate-800">開課前確認表</div>
          {value.submittedAt && (
            <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${locked ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
              {locked ? "園所端已鎖定" : "已重新開放"}
            </span>
          )}
        </div>
        <div className="mt-1 text-xs text-slate-500">簡化版本，園所 1～2 分鐘即可填完。此區預設儲存到目前學期。</div>
        <div className="mt-3 flex flex-wrap gap-2">
          {onCopyPrevious && (
            <button type="button" onClick={onCopyPrevious} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600">
              複製上一學期
            </button>
          )}
          {locked && onReopen && (
            <button type="button" onClick={onReopen} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">
              重新開放填寫
            </button>
          )}
          {onReset && (
            <button type="button" onClick={onReset} className="rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs font-semibold text-rose-600">
              清空重新填寫
            </button>
          )}
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-4">
        <CountInput label="幼幼班" value={value.toddlerClassCount ?? ""} onChange={(v) => update({ toddlerClassCount: v })} />
        <CountInput label="小班" value={value.smallClassCount ?? ""} onChange={(v) => update({ smallClassCount: v })} />
        <CountInput label="中班" value={value.middleClassCount ?? ""} onChange={(v) => update({ middleClassCount: v })} />
        <CountInput label="大班" value={value.bigClassCount ?? ""} onChange={(v) => update({ bigClassCount: v })} />
      </div>
      <div className="mt-4">
        <div className="mb-2 text-xs font-medium text-slate-500">上課地點</div>
        <div className="flex flex-wrap gap-2">
          {LOCATION_OPTIONS.map((item) => (
            <button key={item} type="button" onClick={() => update({ location: item })} className={`rounded-lg border px-3 py-2 text-xs font-semibold ${value.location === item ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-600"}`}>
              {item}
            </button>
          ))}
        </div>
        {value.location === "其他" && <input value={value.otherLocation ?? ""} onChange={(e) => update({ otherLocation: e.target.value })} placeholder="其他地點" className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />}
        <input value={value.rainyLocation ?? ""} onChange={(e) => update({ rainyLocation: e.target.value })} placeholder="雨天備用地點" className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
      </div>
      <div className="mt-4">
        <div className="mb-2 text-xs font-medium text-slate-500">希望老師教學方式</div>
        <div className="flex flex-wrap gap-2">
          {TEACHING_STYLE_OPTIONS.map((item) => (
            <button key={item} type="button" onClick={() => toggleStyle(item)} className={`rounded-full border px-3 py-2 text-xs font-semibold ${value.teachingStyles?.includes(item) ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-600"}`}>
              {item}
            </button>
          ))}
        </div>
      </div>
      <textarea value={value.classNotes ?? ""} onChange={(e) => update({ classNotes: e.target.value })} rows={2} placeholder="班級注意事項，例如：班級較活潑、較害羞、需注意特殊需求幼兒等" className="mt-4 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
      <textarea value={value.otherReminders ?? ""} onChange={(e) => update({ otherReminders: e.target.value })} rows={2} placeholder="其他提醒，例如：入校動線、停車位置、器材擺放、聯絡窗口等" className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
    </div>
  );
}

function CountInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="text-xs font-medium text-slate-500">
      {label}人數
      <div className="mt-1 flex items-center rounded-lg border border-slate-200 bg-white px-3 py-2">
        <input inputMode="numeric" value={value} onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, ""))} className="min-w-0 flex-1 text-sm outline-none" />
        <span className="text-xs text-slate-400">人</span>
      </div>
    </label>
  );
}
