"use client";
import { useEffect, useRef, useState } from "react";
import { useScrollToFormOnEdit } from "@/lib/useScrollToFormOnEdit";

type UserAccount = {
  id: number;
  username: string;
  name: string;
  role: string;
  isActive: boolean;
  createdAt: string;
};

const EMPTY = { username: "", name: "", password: "", isActive: true };

export default function UsersPage() {
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");
  const formRef = useRef<HTMLDivElement | null>(null);
  const firstInputRef = useRef<HTMLInputElement | null>(null);
  const scrollToFormOnEdit = useScrollToFormOnEdit(formRef, firstInputRef);

  const load = () => fetch("/api/users").then((r) => r.json()).then(setUsers);
  useEffect(() => { load(); }, []);

  async function save() {
    setError("");
    const url = editing ? `/api/users/${editing}` : "/api/users";
    const res = await fetch(url, {
      method: editing ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "儲存失敗");
      return;
    }
    setForm(EMPTY);
    setEditing(null);
    setShowForm(false);
    load();
  }

  function edit(u: UserAccount) {
    setForm({ username: u.username, name: u.name, password: "", isActive: u.isActive });
    setEditing(u.id);
    setShowForm(true);
    scrollToFormOnEdit();
  }

  async function del(u: UserAccount) {
    if (!confirm(`確定刪除帳號「${u.name}」？`)) return;
    await fetch(`/api/users/${u.id}`, { method: "DELETE" });
    load();
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">帳號管理</h1>
          <p className="text-sm text-slate-500">每位行政人員可使用自己的帳號登入；目前權限皆相同。</p>
        </div>
        <button
          onClick={() => { setForm(EMPTY); setEditing(null); setShowForm(true); setError(""); }}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          + 新增帳號
        </button>
      </div>

      {showForm && (
        <div ref={formRef} className={`mb-6 rounded-xl border bg-white p-5 shadow-sm ${editing ? "border-blue-200 ring-2 ring-blue-50" : "border-slate-200"}`}>
          <h2 className="mb-4 font-semibold text-slate-700">{editing ? "正在編輯帳號" : "新增帳號"}</h2>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-4">
            <div className="md:col-span-4 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-500">基本資料</div>
            <div>
              <label>帳號 *</label>
              <input ref={firstInputRef} value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder="例如 amy" />
            </div>
            <div>
              <label>姓名 *</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="例如 王小美" />
            </div>
            <div>
              <label>{editing ? "新密碼（不改可留空）" : "密碼 *"}</label>
              <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="至少 4 碼" />
            </div>
            <div className="flex items-end pb-2">
              <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-700">
                <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} className="h-4 w-4" />
                啟用帳號
              </label>
            </div>
          </div>
          {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
          <div className="mt-5 flex gap-3">
            <button onClick={save} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">儲存</button>
            <button onClick={() => { setShowForm(false); setEditing(null); setError(""); }} className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200">取消</button>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-5 py-3 text-left font-semibold">姓名</th>
                <th className="px-5 py-3 text-left font-semibold">帳號</th>
                <th className="px-5 py-3 text-left font-semibold">權限</th>
                <th className="px-5 py-3 text-left font-semibold">狀態</th>
                <th className="px-5 py-3 text-left font-semibold">建立時間</th>
                <th className="px-5 py-3 text-left font-semibold">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50/70">
                  <td className="px-5 py-4 font-medium text-slate-900">{u.name}</td>
                  <td className="px-5 py-4 font-mono text-xs text-slate-500">{u.username}</td>
                  <td className="px-5 py-4"><span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-medium text-blue-700">全部功能</span></td>
                  <td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${u.isActive ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"}`}>{u.isActive ? "啟用" : "停用"}</span></td>
                  <td className="px-5 py-4 text-xs text-slate-500">{u.createdAt?.slice(0, 10)}</td>
                  <td className="px-5 py-4">
                    <div className="flex gap-4">
                      <button onClick={() => edit(u)} className="text-sm font-medium text-blue-600 hover:text-blue-800">編輯</button>
                      <button onClick={() => del(u)} className="text-sm font-medium text-red-500 hover:text-red-700">刪除</button>
                    </div>
                  </td>
                </tr>
              ))}
              {users.length === 0 && <tr><td colSpan={6} className="py-8 text-center text-slate-400">尚未建立帳號，可先用舊後台密碼登入後新增。</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
