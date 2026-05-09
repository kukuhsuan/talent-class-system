"use client";
import { useEffect, useState } from "react";

type Teacher = {
  id: number; name: string; rateAfterSchool: number; rateInSchool: number;
  rateDemo: number; travelFee: number; notes: string;
};

const EMPTY: Omit<Teacher, "id"> = {
  name: "", rateAfterSchool: 500, rateInSchool: 500, rateDemo: 200, travelFee: 0, notes: "",
};

export default function TeachersPage() {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");

  const load = () => fetch("/api/teachers").then((r) => r.json()).then(setTeachers);
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!form.name.trim()) return alert("請填寫老師姓名");
    if (editing !== null) {
      await fetch(`/api/teachers/${editing}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    } else {
      await fetch("/api/teachers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    }
    setForm(EMPTY); setEditing(null); setShowForm(false); load();
  };

  const del = async (id: number, name: string) => {
    if (!confirm(`確定刪除老師「${name}」？`)) return;
    await fetch(`/api/teachers/${id}`, { method: "DELETE" });
    load();
  };

  const edit = (t: Teacher) => {
    setForm({ name: t.name, rateAfterSchool: t.rateAfterSchool, rateInSchool: t.rateInSchool, rateDemo: t.rateDemo, travelFee: t.travelFee, notes: t.notes });
    setEditing(t.id); setShowForm(true);
  };

  const filtered = teachers.filter((t) => t.name.includes(search));

  return (
    <div>
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
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 mb-6">
          <h2 className="font-semibold text-slate-700 mb-4">{editing ? "編輯老師" : "新增老師"}</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="col-span-2 md:col-span-1">
              <label>老師姓名 *</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="姓名" />
            </div>
            <div>
              <label>課後時薪（元）</label>
              <input type="number" value={form.rateAfterSchool} onChange={(e) => setForm({ ...form, rateAfterSchool: Number(e.target.value) })} />
            </div>
            <div>
              <label>課內時薪（元）</label>
              <input type="number" value={form.rateInSchool} onChange={(e) => setForm({ ...form, rateInSchool: Number(e.target.value) })} />
            </div>
            <div>
              <label>Demo 時薪（元）</label>
              <input type="number" value={form.rateDemo} onChange={(e) => setForm({ ...form, rateDemo: Number(e.target.value) })} />
            </div>
            <div>
              <label>每節車費（元）</label>
              <input type="number" value={form.travelFee} onChange={(e) => setForm({ ...form, travelFee: Number(e.target.value) })} />
            </div>
            <div className="col-span-2">
              <label>備註</label>
              <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="備註說明" />
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={save} className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-2 rounded-lg text-sm">儲存</button>
            <button onClick={() => { setShowForm(false); setEditing(null); }} className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium px-4 py-2 rounded-lg text-sm">取消</button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="搜尋老師姓名..." className="max-w-xs" />
        </div>
        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>姓名</th>
                <th>課後時薪</th>
                <th>課內時薪</th>
                <th>Demo 時薪</th>
                <th>車費/節</th>
                <th>備註</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => (
                <tr key={t.id}>
                  <td className="font-medium">{t.name}</td>
                  <td className="text-center">${t.rateAfterSchool}</td>
                  <td className="text-center">${t.rateInSchool}</td>
                  <td className="text-center">${t.rateDemo}</td>
                  <td className="text-center">{t.travelFee > 0 ? `$${t.travelFee}` : "-"}</td>
                  <td className="text-slate-500 text-xs">{t.notes || "-"}</td>
                  <td>
                    <div className="flex gap-2">
                      <button onClick={() => edit(t)} className="text-blue-600 hover:text-blue-800 text-sm font-medium">編輯</button>
                      <button onClick={() => del(t.id, t.name)} className="text-red-500 hover:text-red-700 text-sm font-medium">刪除</button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="text-center text-slate-400 py-8">尚無資料</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
