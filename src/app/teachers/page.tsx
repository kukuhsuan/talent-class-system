"use client";
import { useEffect, useRef, useState } from "react";
import { SaveButton } from "@/components/SaveButton";
import { Toast } from "@/components/Toast";
import { ensureOk } from "@/lib/clientApi";
import { useToast } from "@/lib/useToast";
import { useScrollToFormOnEdit } from "@/lib/useScrollToFormOnEdit";

type Teacher = {
  id: number; name: string; email: string; phone: string; rateAfterSchool: number; rateInSchool: number;
  rateDemo: number; travelFee: number; isAssistant: boolean; assistantFee: number; notes: string; lineUserId: string | null; lineRegion: string;
};

const EMPTY: Omit<Teacher, "id"> = {
  name: "", email: "", phone: "", rateAfterSchool: 500, rateInSchool: 500, rateDemo: 200, travelFee: 0, isAssistant: false, assistantFee: 0, notes: "", lineUserId: "", lineRegion: "north",
};

const LINE_REGIONS = [
  { value: "north", label: "北部" },
  { value: "south", label: "南部" },
];

export default function TeachersPage() {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const { toast, showToast } = useToast();
  const formRef = useRef<HTMLDivElement | null>(null);
  const firstInputRef = useRef<HTMLInputElement | null>(null);
  const scrollToFormOnEdit = useScrollToFormOnEdit(formRef, firstInputRef);

  const load = () => fetch("/api/teachers").then((r) => r.json()).then(setTeachers);
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!form.name.trim()) return alert("請填寫老師姓名");
    if (saving) return;
    setSaving(true);
    try {
      if (editing !== null) {
        const res = await fetch(`/api/teachers/${editing}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
        await ensureOk(res, "老師資料儲存失敗");
      } else {
        const res = await fetch("/api/teachers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
        await ensureOk(res, "老師資料新增失敗");
      }
      setForm(EMPTY); setEditing(null); setShowForm(false); load();
      showToast("success", "老師資料已儲存");
    } catch (e) {
      showToast("error", (e as Error).message || "老師資料儲存失敗", 3000);
    } finally {
      setSaving(false);
    }
  };

  const del = async (id: number, name: string) => {
    if (!confirm(`確定刪除老師「${name}」？`)) return;
    await fetch(`/api/teachers/${id}`, { method: "DELETE" });
    load();
  };

  const edit = (t: Teacher) => {
    setForm({ name: t.name, email: t.email ?? "", phone: t.phone ?? "", rateAfterSchool: t.rateAfterSchool, rateInSchool: t.rateInSchool, rateDemo: t.rateDemo, travelFee: t.travelFee, isAssistant: Boolean(t.isAssistant), assistantFee: t.assistantFee ?? 0, notes: t.notes, lineUserId: t.lineUserId ?? "", lineRegion: t.lineRegion || "north" });
    setEditing(t.id); setShowForm(true);
    scrollToFormOnEdit();
  };

  const filtered = teachers.filter((t) => t.name.includes(search));

  return (
    <div>
      <Toast toast={toast} />
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-800">👩‍🏫 老師管理</h1>
          <p className="text-sm text-slate-500">共 {teachers.length} 位老師</p>
        </div>
        <button onClick={() => { setForm(EMPTY); setEditing(null); setShowForm(true); }}
          className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-2 rounded-lg transition-colors text-sm">
          + 新增老師
        </button>
      </div>

      {showForm && (
        <div ref={formRef} className={`bg-white rounded-xl border shadow-sm p-5 md:p-6 mb-6 ${editing ? "border-blue-200 ring-2 ring-blue-50" : "border-slate-200"}`}>
          <h2 className="font-semibold text-slate-700 mb-4">{editing ? "正在編輯老師" : "新增老師"}</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
            <div className="md:col-span-4 text-xs font-semibold text-slate-500 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">基本資料</div>
            <div>
              <label>老師姓名 *</label>
              <input ref={firstInputRef} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="姓名" />
            </div>
            <div className="md:col-span-2">
              <label>Email</label>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="teacher@gmail.com" />
            </div>
            <div>
              <label>電話</label>
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="0912-345-678" />
            </div>
            <div className="md:col-span-4 text-xs font-semibold text-slate-500 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">LINE 綁定</div>
            <div className="md:col-span-3">
              <label>LINE User ID</label>
              <input value={form.lineUserId ?? ""} onChange={(e) => setForm({ ...form, lineUserId: e.target.value })} placeholder="Uxxxxxxxxxxxxxxxx" />
            </div>
            <div>
              <label>LINE 區域</label>
              <select value={form.lineRegion || "north"} onChange={(e) => setForm({ ...form, lineRegion: e.target.value })}>
                {LINE_REGIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
            <div className="md:col-span-4 text-xs font-semibold text-slate-500 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">薪資資訊</div>
            <div className="md:col-span-4 rounded-lg border border-blue-100 bg-blue-50/40 px-3 py-3">
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                <input type="checkbox" checked={form.isAssistant} onChange={(e) => setForm({ ...form, isAssistant: e.target.checked })} className="h-4 w-4" />
                是否為助教
              </label>
              <p className="mt-1 text-xs text-slate-500">未勾選為主教，薪資使用課內 / 課後 / Demo / 車費。勾選後薪資使用助教費用。</p>
            </div>
            <div>
              <label>課後時薪（元）</label>
              <input type="number" value={form.rateAfterSchool} onChange={(e) => setForm({ ...form, rateAfterSchool: Number(e.target.value) })} disabled={form.isAssistant} />
            </div>
            <div>
              <label>課內時薪（元）</label>
              <input type="number" value={form.rateInSchool} onChange={(e) => setForm({ ...form, rateInSchool: Number(e.target.value) })} disabled={form.isAssistant} />
            </div>
            <div>
              <label>Demo 時薪（元）</label>
              <input type="number" value={form.rateDemo} onChange={(e) => setForm({ ...form, rateDemo: Number(e.target.value) })} disabled={form.isAssistant} />
            </div>
            <div>
              <label>每節車費（元）</label>
              <input type="number" value={form.travelFee} onChange={(e) => setForm({ ...form, travelFee: Number(e.target.value) })} disabled={form.isAssistant} />
            </div>
            <div>
              <label>助教費用（元 / 小時）</label>
              <input type="number" value={form.assistantFee} onChange={(e) => setForm({ ...form, assistantFee: Number(e.target.value) })} disabled={!form.isAssistant} />
            </div>
            <div className="md:col-span-4 text-xs font-semibold text-slate-500 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">備註</div>
            <div className="md:col-span-4">
              <label>備註</label>
              <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="備註說明" />
            </div>
          </div>
          <div className="flex gap-3 mt-5">
            <SaveButton saving={saving} onClick={save} />
            <button disabled={saving} onClick={() => { setShowForm(false); setEditing(null); }} className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium px-4 py-2 rounded-lg text-sm disabled:cursor-not-allowed disabled:opacity-60">取消</button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="搜尋老師姓名..." className="max-w-xs" />
        </div>
        <div className="md:hidden divide-y divide-slate-100">
          {filtered.map((t) => (
            <div key={t.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold text-slate-800">{t.name}</div>
                  <div className="mt-1">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] ${t.isAssistant ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"}`}>{t.isAssistant ? "助教" : "主教"}</span>
                  </div>
                  <div title={t.email || ""} className="mt-1 max-w-[260px] truncate text-xs text-slate-500">{t.email || "—"}</div>
                  <div title={t.phone || ""} className="mt-1 text-xs text-slate-500">{t.phone || "—"}</div>
                  <div className="mt-2">
                    {t.lineUserId
                      ? <span className="rounded-full bg-green-100 px-2 py-0.5 text-[11px] text-green-700">LINE 已綁定</span>
                      : <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">未綁定</span>}
                  </div>
                </div>
                <div className="flex shrink-0 gap-3">
                  <button onClick={() => edit(t)} className="text-blue-600 hover:text-blue-800 text-sm font-medium">編輯</button>
                  <button onClick={() => del(t.id, t.name)} className="text-red-500 hover:text-red-700 text-sm font-medium">刪除</button>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                {t.isAssistant ? (
                  <div className="rounded-lg bg-purple-50 px-3 py-2"><div className="text-xs text-purple-400">助教費用</div><div className="font-medium text-purple-700">${t.assistantFee}</div></div>
                ) : (
                  <>
                    <div className="rounded-lg bg-slate-50 px-3 py-2"><div className="text-xs text-slate-400">課後時薪</div><div className="font-medium text-slate-700">${t.rateAfterSchool}</div></div>
                    <div className="rounded-lg bg-slate-50 px-3 py-2"><div className="text-xs text-slate-400">課內時薪</div><div className="font-medium text-slate-700">${t.rateInSchool}</div></div>
                    <div className="rounded-lg bg-slate-50 px-3 py-2"><div className="text-xs text-slate-400">Demo</div><div className="font-medium text-slate-700">${t.rateDemo}</div></div>
                    <div className="rounded-lg bg-slate-50 px-3 py-2"><div className="text-xs text-slate-400">車費</div><div className="font-medium text-slate-700">{t.travelFee > 0 ? `$${t.travelFee}` : "-"}</div></div>
                  </>
                )}
              </div>
              {t.notes && <div className="mt-3 text-xs text-slate-500">{t.notes}</div>}
            </div>
          ))}
          {filtered.length === 0 && <div className="py-8 text-center text-slate-400">尚無資料</div>}
        </div>
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[1180px] text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="w-36 px-5 py-3 text-left font-semibold">姓名</th>
                <th className="w-64 px-5 py-3 text-left font-semibold">Email</th>
                <th className="w-40 px-5 py-3 text-left font-semibold">電話</th>
                <th className="w-40 px-5 py-3 text-left font-semibold">LINE</th>
                <th className="w-24 px-4 py-3 text-center font-semibold">身份</th>
                <th className="px-4 py-3 text-center font-semibold">課後時薪</th>
                <th className="px-4 py-3 text-center font-semibold">課內時薪</th>
                <th className="px-4 py-3 text-center font-semibold">Demo</th>
                <th className="px-4 py-3 text-center font-semibold">車費</th>
                <th className="px-4 py-3 text-center font-semibold">助教費</th>
                <th className="px-4 py-3 text-left font-semibold">備註</th>
                <th className="px-4 py-3 text-left font-semibold">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50/70">
                  <td className="px-5 py-4 font-medium text-slate-800 whitespace-nowrap">{t.name}</td>
                  <td title={t.email || ""} className="px-5 py-4 max-w-[260px] truncate text-xs text-slate-500">{t.email || "—"}</td>
                  <td title={t.phone || ""} className="px-5 py-4 text-sm text-slate-600 whitespace-nowrap">{t.phone || "—"}</td>
                  <td className="px-5 py-4">
                    <div className="flex flex-col gap-1">
                      {t.lineUserId
                        ? <span className="inline-flex w-fit rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">已綁定</span>
                        : <span className="inline-flex w-fit rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">未綁定</span>}
                      {t.lineRegion && <span className="text-[11px] text-slate-400">{LINE_REGIONS.find((r) => r.value === t.lineRegion)?.label ?? t.lineRegion}</span>}
                    </div>
                  </td>
                  <td className="px-4 py-4 text-center"><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${t.isAssistant ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"}`}>{t.isAssistant ? "助教" : "主教"}</span></td>
                  <td className="px-4 py-4 text-center text-slate-700">{t.isAssistant ? "-" : `$${t.rateAfterSchool}`}</td>
                  <td className="px-4 py-4 text-center text-slate-700">{t.isAssistant ? "-" : `$${t.rateInSchool}`}</td>
                  <td className="px-4 py-4 text-center text-slate-700">{t.isAssistant ? "-" : `$${t.rateDemo}`}</td>
                  <td className="px-4 py-4 text-center text-slate-700">{!t.isAssistant && t.travelFee > 0 ? `$${t.travelFee}` : "-"}</td>
                  <td className="px-4 py-4 text-center text-slate-700">{t.isAssistant ? `$${t.assistantFee}` : "-"}</td>
                  <td className="px-4 py-4 max-w-[260px] truncate text-slate-500 text-xs" title={t.notes || ""}>{t.notes || "-"}</td>
                  <td className="px-4 py-4">
                    <div className="flex gap-4 whitespace-nowrap">
                      <button onClick={() => edit(t)} className="text-blue-600 hover:text-blue-800 text-sm font-medium">編輯</button>
                      <button onClick={() => del(t.id, t.name)} className="text-red-500 hover:text-red-700 text-sm font-medium">刪除</button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={12} className="text-center text-slate-400 py-8">尚無資料</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
