"use client";
import { useEffect, useRef, useState } from "react";
import { COURSE_OPTIONS, courseLabel } from "@/lib/courseMeta";
import { useScrollToFormOnEdit } from "@/lib/useScrollToFormOnEdit";

type Teacher = { id: number; name: string };
type Substitute = {
  id: number | string; attendanceId?: number; source?: "manual" | "attendance"; date: string; school: string; courseType: string;
  originalTeacher: Teacher; substituteTeacher: Teacher | null;
  confirmed: boolean; fee: number | null; notes: string; time?: string; address?: string;
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
  const formRef = useRef<HTMLDivElement | null>(null);
  const firstInputRef = useRef<HTMLInputElement | null>(null);
  const scrollToFormOnEdit = useScrollToFormOnEdit(formRef, firstInputRef);

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

  const del = async (id: number | string) => {
    if (typeof id === "string") return alert("這筆是由出勤紀錄帶入，請到出勤紀錄調整。");
    if (!confirm("確定刪除此筆代課紀錄？")) return;
    await fetch(`/api/substitutes/${id}`, { method: "DELETE" });
    load();
  };

  const edit = (r: Substitute) => {
    if (r.source === "attendance") return alert("這筆是由出勤紀錄帶入，請到出勤紀錄調整代課老師。");
    setForm({ date: r.date.slice(0, 10), school: r.school, courseType: r.courseType, originalTeacherId: r.originalTeacher.id, substituteTeacherId: r.substituteTeacher?.id ?? 0, confirmed: r.confirmed, fee: r.fee?.toString() ?? "", notes: r.notes });
    setEditing(Number(r.id)); setShowForm(true);
    scrollToFormOnEdit();
  };

  const toggle = async (r: Substitute) => {
    if (r.source === "attendance") return alert("這筆是由出勤紀錄帶入，通知狀態請在出勤/LINE流程確認。");
    await fetch(`/api/substitutes/${r.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: r.date.slice(0, 10),
        school: r.school,
        courseType: r.courseType,
        originalTeacherId: r.originalTeacher.id,
        substituteTeacherId: r.substituteTeacher?.id ?? null,
        confirmed: !r.confirmed,
        fee: r.fee,
        notes: r.notes,
      }),
    });
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
        <strong>提醒：</strong>出勤紀錄若已指定代課老師，這裡會自動顯示同一筆代課資料；薪資仍以出勤紀錄的實際上課老師為準。
      </div>

      {showForm && (
        <div ref={formRef} className={`bg-white rounded-xl border shadow-sm p-5 mb-6 ${editing ? "border-blue-200 ring-2 ring-blue-50" : "border-slate-200"}`}>
          <h2 className="font-semibold text-slate-700 mb-4">{editing ? "正在編輯代課紀錄" : "新增代課紀錄"}</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label>日期 *</label>
              <input ref={firstInputRef} type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
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
        <div className="md:hidden divide-y divide-slate-100">
          {records.map((r) => (
            <div key={r.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-slate-900">{r.date.slice(0, 10)}</div>
                  <div className="mt-1 font-medium text-slate-800">{r.school}</div>
                  <div className="mt-1 text-xs text-slate-500">{r.courseType ? courseLabel(r.courseType) : "-"}{r.time ? `｜${r.time}` : ""}</div>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-1 text-xs font-medium ${r.source === "attendance" ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-600"}`}>
                  {r.source === "attendance" ? "出勤連動" : "手動"}
                </span>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg bg-orange-50 px-3 py-2">
                  <div className="text-xs text-orange-500">原老師</div>
                  <div className="font-medium text-orange-700">{r.originalTeacher.name}</div>
                </div>
                <div className="rounded-lg bg-blue-50 px-3 py-2">
                  <div className="text-xs text-blue-500">代課老師</div>
                  <div className="font-medium text-blue-700">{r.substituteTeacher?.name ?? "暫停"}</div>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button onClick={() => toggle(r)} className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${r.confirmed ? "bg-green-100 text-green-700 hover:bg-green-200" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>
                  {r.confirmed ? "✓ 已通知" : "未通知"}
                </button>
                {r.address && <span className="text-xs text-slate-500">{r.address}</span>}
              </div>
              {(r.notes || r.address) && <div className="mt-3 text-xs text-slate-500">{r.notes || r.address}</div>}
              <div className="mt-4 flex gap-4">
                <button onClick={() => edit(r)} className="text-blue-600 hover:text-blue-800 text-sm font-medium">編輯</button>
                <button onClick={() => del(r.id)} className="text-red-500 hover:text-red-700 text-sm font-medium">刪除</button>
              </div>
            </div>
          ))}
          {records.length === 0 && <div className="py-8 text-center text-slate-400">尚無代課紀錄</div>}
        </div>
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[1180px] text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="w-28 px-5 py-3 text-left font-semibold">日期</th>
                <th className="w-44 px-5 py-3 text-left font-semibold">園所</th>
                <th className="w-36 px-5 py-3 text-left font-semibold">課程</th>
                <th className="w-32 px-5 py-3 text-left font-semibold">原老師</th>
                <th className="w-32 px-5 py-3 text-left font-semibold">代課老師</th>
                <th className="w-32 px-5 py-3 text-left font-semibold">上課時間</th>
                <th className="w-28 px-5 py-3 text-left font-semibold">是否已通知</th>
                <th className="min-w-64 px-5 py-3 text-left font-semibold">備註</th>
                <th className="w-28 px-5 py-3 text-left font-semibold">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {records.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50/70">
                  <td className="px-5 py-4 text-sm text-slate-700 whitespace-nowrap">{r.date.slice(0, 10)}</td>
                  <td className="px-5 py-4 font-medium text-slate-800">{r.school}</td>
                  <td className="px-5 py-4">
                    <div className="font-medium text-slate-800">{r.courseType ? courseLabel(r.courseType) : "-"}</div>
                    <div className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${r.source === "attendance" ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-600"}`}>
                      {r.source === "attendance" ? "出勤連動" : "手動"}
                    </div>
                  </td>
                  <td className="px-5 py-4"><span className="rounded-full bg-orange-50 px-2.5 py-1 text-sm font-medium text-orange-700">{r.originalTeacher.name}</span></td>
                  <td className="px-5 py-4">{r.substituteTeacher ? <span className="rounded-full bg-blue-50 px-2.5 py-1 text-sm font-medium text-blue-700">{r.substituteTeacher.name}</span> : <span className="text-slate-400 text-sm">暫停</span>}</td>
                  <td className="px-5 py-4 text-slate-700 whitespace-nowrap">{r.time || "-"}</td>
                  <td className="px-5 py-4">
                    <button onClick={() => toggle(r)} className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${r.confirmed ? "bg-green-100 text-green-700 hover:bg-green-200" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>
                      {r.confirmed ? "✓ 已通知" : "未通知"}
                    </button>
                  </td>
                  <td className="px-5 py-4 text-xs leading-5 text-slate-500 whitespace-normal break-words">{r.notes || r.address || "-"}</td>
                  <td className="px-5 py-4">
                    <div className="flex gap-4 whitespace-nowrap">
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
