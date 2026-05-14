"use client";
import { useEffect, useState } from "react";
import { COURSE_OPTIONS, courseLabel } from "@/lib/courseMeta";

type Teacher = { id: number; name: string };
type Substitute = {
  id: number; date: string; school: string; courseType: string;
  originalTeacher: Teacher; substituteTeacher: Teacher | null;
  confirmed: boolean; fee: number | null; notes: string;
};

const today = () => new Date().toISOString().slice(0, 10);
const EMPTY_FORM = {
  date: today(), school: "", courseType: "", originalTeacherId: 0,
  substituteTeacherId: 0, confirmed: false, fee: "", notes: "",
};

export default function SubstitutesPage() {
  const [records, setRecords] = useState<Substitute[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editing, setEditing] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);

  const load = () =>
    Promise.all([
      fetch("/api/substitutes").then((r) => r.json()),
      fetch("/api/teachers").then((r) => r.json()),
    ]).then(([s, t]) => { setRecords(s); setTeachers(t); });

  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!form.date || !form.school || !form.originalTeacherId) return alert("請填寫必填欄位");
    const body = JSON.stringify({
      ...form,
      substituteTeacherId: form.substituteTeacherId || null,
      fee: form.fee === "" ? null : Number(form.fee),
    });
    const headers = { "Content-Type": "application/json" };
    if (editing !== null) {
      await fetch(`/api/substitutes/${editing}`, { method: "PUT", headers, body });
    } else {
      await fetch("/api/substitutes", { method: "POST", headers, body });
    }
    setForm(EMPTY_FORM); setEditing(null); setShowForm(false); load();
  };

  const del = async (id: number) => {
    if (!confirm("確定刪除此筆代課紀錄？")) return;
    await fetch(`/api/substitutes/${id}`, { method: "DELETE" });
    load();
  };

  const edit = (r: Substitute) => {
    setForm({ date: r.date.slice(0, 10), school: r.school, courseType: r.courseType, originalTeacherId: r.originalTeacher.id, substituteTeacherId: r.substituteTeacher?.id ?? 0, confirmed: r.confirmed, fee: r.fee?.toString() ?? "", notes: r.notes });
    setEditing(r.id); setShowForm(true);
  };

  const toggle = async (r: Substitute) => {
    await fetch(`/api/substitutes/${r.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...r, originalTeacherId: r.originalTeacher.id, substituteTeacherId: r.substituteTeacher?.id ?? null, confirmed: !r.confirmed }) });
    load();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-800">🔄 代課紀錄</h1>
          <p className="text-sm text-slate-500">共 {records.length} 筆</p>
        </div>
        <button onClick={() => { setForm({ ...EMPTY_FORM, date: today() }); setEditing(null); setShowForm(true); }}
          className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-2 rounded-lg transition-colors text-sm">
          + 新增代課紀錄
        </button>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 text-sm text-amber-800">
        <strong>提醒：</strong>新增代課紀錄後，請同時至「上課紀錄」將該堂的「上課老師」改為代課老師，薪資計算才會正確。
      </div>

      {showForm && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 mb-6">
          <h2 className="font-semibold text-slate-700 mb-4">{editing ? "編輯代課紀錄" : "新增代課紀錄"}</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label>日期 *</label>
              <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </div>
            <div>
              <label>學校 *</label>
              <input value={form.school} onChange={(e) => setForm({ ...form, school: e.target.value })} placeholder="學校名稱" />
            </div>
            <div>
              <label>課程項目</label>
              <select value={form.courseType} onChange={(e) => setForm({ ...form, courseType: e.target.value })}>
                <option value="">-- 選擇課程 --</option>
                {COURSE_OPTIONS.map((c) => <option key={c.code} value={c.code}>{c.label}（{c.code}）</option>)}
                {form.courseType && !COURSE_OPTIONS.some((c) => c.code === form.courseType) && <option value={form.courseType}>{courseLabel(form.courseType)}（既有資料）</option>}
              </select>
            </div>
            <div>
              <label>請假老師 *</label>
              <select value={form.originalTeacherId} onChange={(e) => setForm({ ...form, originalTeacherId: Number(e.target.value) })}>
                <option value={0}>-- 選擇老師 --</option>
                {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div>
              <label>代課老師</label>
              <select value={form.substituteTeacherId} onChange={(e) => setForm({ ...form, substituteTeacherId: Number(e.target.value) })}>
                <option value={0}>-- 無代課/暫停 --</option>
                {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div>
              <label>代課費用（元）</label>
              <input type="number" value={form.fee} onChange={(e) => setForm({ ...form, fee: e.target.value })} placeholder="200" />
            </div>
            <div className="col-span-2">
              <label>備註</label>
              <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="已通知園所 ..." />
            </div>
            <div className="flex items-end pb-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.confirmed} onChange={(e) => setForm({ ...form, confirmed: e.target.checked })} className="w-4 h-4" />
                <span className="text-sm font-medium text-slate-700">已通知園所</span>
              </label>
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={save} className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-2 rounded-lg text-sm">儲存</button>
            <button onClick={() => { setShowForm(false); setEditing(null); }} className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium px-4 py-2 rounded-lg text-sm">取消</button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>日期</th>
                <th>學校</th>
                <th>項目</th>
                <th>請假老師</th>
                <th>代課老師</th>
                <th>代課費</th>
                <th>通知園所</th>
                <th>備註</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r) => (
                <tr key={r.id}>
                  <td className="text-sm">{r.date.slice(0, 10)}</td>
                  <td className="font-medium">{r.school}</td>
                  <td>{r.courseType ? courseLabel(r.courseType) : "-"}</td>
                  <td className="text-orange-600">{r.originalTeacher.name}</td>
                  <td>{r.substituteTeacher ? <span className="text-blue-600 font-medium">{r.substituteTeacher.name}</span> : <span className="text-slate-400 text-sm">暫停</span>}</td>
                  <td>{r.fee ? `$${r.fee}` : "-"}</td>
                  <td>
                    <button onClick={() => toggle(r)} className={`text-xs px-2 py-1 rounded-full font-medium transition-colors ${r.confirmed ? "bg-green-100 text-green-700 hover:bg-green-200" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>
                      {r.confirmed ? "✓ 已通知" : "未通知"}
                    </button>
                  </td>
                  <td className="text-xs text-slate-500">{r.notes || "-"}</td>
                  <td>
                    <div className="flex gap-2">
                      <button onClick={() => edit(r)} className="text-blue-600 hover:text-blue-800 text-sm font-medium">編輯</button>
                      <button onClick={() => del(r.id)} className="text-red-500 hover:text-red-700 text-sm font-medium">刪除</button>
                    </div>
                  </td>
                </tr>
              ))}
              {records.length === 0 && (
                <tr><td colSpan={9} className="text-center text-slate-400 py-8">尚無代課紀錄</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
