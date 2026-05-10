"use client";
import { useEffect, useState } from "react";

const REGIONS = ["台北市", "新北市", "桃園市", "新竹市", "新竹縣", "苗栗縣", "台中市", "彰化縣", "南投縣", "雲林縣", "嘉義市", "嘉義縣", "台南市", "高雄市", "屏東縣", "宜蘭縣", "花蓮縣", "台東縣", "其他"];

type School = { id: number; name: string; region: string; address: string; phone: string; contact: string; notes: string };

const empty: Omit<School, "id"> = { name: "", region: "", address: "", phone: "", contact: "", notes: "" };

export default function SchoolsPage() {
  const [schools, setSchools] = useState<School[]>([]);
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState<number | null>(null);
  const [filterRegion, setFilterRegion] = useState("");
  const [showForm, setShowForm] = useState(false);

  useEffect(() => { fetchSchools(); }, []);

  async function fetchSchools() {
    const res = await fetch("/api/schools");
    setSchools(await res.json());
  }

  async function save() {
    if (!form.name) return;
    if (editing != null) {
      await fetch(`/api/schools/${editing}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    } else {
      await fetch("/api/schools", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    }
    setForm(empty);
    setEditing(null);
    setShowForm(false);
    fetchSchools();
  }

  async function del(id: number) {
    if (!confirm("確定刪除此園所？")) return;
    await fetch(`/api/schools/${id}`, { method: "DELETE" });
    fetchSchools();
  }

  function edit(s: School) {
    setForm({ name: s.name, region: s.region, address: s.address, phone: s.phone, contact: s.contact, notes: s.notes });
    setEditing(s.id);
    setShowForm(true);
  }

  const filtered = filterRegion ? schools.filter((s) => s.region === filterRegion) : schools;
  const regionGroups = [...new Set(schools.map((s) => s.region).filter(Boolean))].sort();

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">園所管理</h1>
        <button onClick={() => { setForm(empty); setEditing(null); setShowForm(true); }} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700">+ 新增園所</button>
      </div>

      {showForm && (
        <div className="bg-white border rounded-xl p-6 mb-6 shadow-sm">
          <h2 className="font-semibold text-gray-700 mb-4">{editing != null ? "編輯園所" : "新增園所"}</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">園所名稱 *</label>
              <input className="w-full border rounded-lg px-3 py-2 text-sm" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">地區</label>
              <select className="w-full border rounded-lg px-3 py-2 text-sm" value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })}>
                <option value="">選擇地區</option>
                {REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div className="col-span-2">
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
            <div className="col-span-2">
              <label className="text-xs text-gray-500 mb-1 block">備註</label>
              <input className="w-full border rounded-lg px-3 py-2 text-sm" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <button onClick={save} className="bg-blue-600 text-white px-6 py-2 rounded-lg text-sm hover:bg-blue-700">儲存</button>
            <button onClick={() => { setShowForm(false); setEditing(null); setForm(empty); }} className="bg-gray-100 text-gray-700 px-6 py-2 rounded-lg text-sm hover:bg-gray-200">取消</button>
          </div>
        </div>
      )}

      <div className="flex gap-3 mb-4 flex-wrap">
        <button onClick={() => setFilterRegion("")} className={`px-3 py-1 rounded-full text-sm border ${!filterRegion ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600"}`}>全部</button>
        {regionGroups.map((r) => (
          <button key={r} onClick={() => setFilterRegion(r)} className={`px-3 py-1 rounded-full text-sm border ${filterRegion === r ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600"}`}>{r}</button>
        ))}
      </div>

      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="text-left px-4 py-3 font-medium">園所名稱</th>
              <th className="text-left px-4 py-3 font-medium">地區</th>
              <th className="text-left px-4 py-3 font-medium">地址</th>
              <th className="text-left px-4 py-3 font-medium">電話</th>
              <th className="text-left px-4 py-3 font-medium">聯絡人</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.map((s) => (
              <tr key={s.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium">{s.name}</td>
                <td className="px-4 py-3"><span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full text-xs">{s.region || "—"}</span></td>
                <td className="px-4 py-3 text-gray-500">{s.address || "—"}</td>
                <td className="px-4 py-3 text-gray-500">{s.phone || "—"}</td>
                <td className="px-4 py-3 text-gray-500">{s.contact || "—"}</td>
                <td className="px-4 py-3 text-right space-x-2">
                  <button onClick={() => edit(s)} className="text-blue-600 hover:underline text-xs">編輯</button>
                  <button onClick={() => del(s.id)} className="text-red-500 hover:underline text-xs">刪除</button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={6} className="text-center py-8 text-gray-400">尚無園所資料</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-400 mt-3">共 {filtered.length} 間園所</p>
    </div>
  );
}
