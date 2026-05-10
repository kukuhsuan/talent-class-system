"use client";
import { useEffect, useState } from "react";
import { useDepartment } from "@/lib/departmentContext";

type Teacher = { id: number; name: string };
type Course = { id: number; code: string; school: string; courseType: string; teacher: Teacher; teacherId: number; category: string };
type Attendance = {
  id: number; date: string; course: Course; actualTeacher: Teacher;
  studentCount: number | null; cancelled: boolean; category: string; hours: number; notes: string;
};

const today = () => new Date().toISOString().slice(0, 10);
const CATS = ["課後", "課內", "Demo", "試上"];
const EMPTY_FORM = {
  date: today(), courseId: 0, actualTeacherId: 0,
  studentCount: "", cancelled: false, category: "課後", hours: 1, notes: "",
};

export default function AttendancePage() {
  const { dept } = useDepartment();
  const [records, setRecords] = useState<Attendance[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editing, setEditing] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [filterYear, setFilterYear] = useState(new Date().getFullYear());
  const [filterMonth, setFilterMonth] = useState(new Date().getMonth() + 1);

  const load = () => {
    const params = new URLSearchParams({ year: String(filterYear), month: String(filterMonth) });
    if (dept) params.set("dept", dept);
    Promise.all([
      fetch(`/api/attendance?${params}`).then((r) => r.json()),
      fetch(`/api/courses${dept ? `?dept=${encodeURIComponent(dept)}` : ""}`).then((r) => r.json()),
      fetch("/api/teachers").then((r) => r.json()),
    ]).then(([a, c, t]) => { setRecords(a); setCourses(c); setTeachers(t); });
  };

  useEffect(() => { load(); }, [filterYear, filterMonth, dept]);

  const onCourseChange = (courseId: number) => {
    const c = courses.find((x) => x.id === courseId);
    setForm((f) => ({ ...f, courseId, actualTeacherId: c?.teacherId ?? 0, category: c?.category ?? "課後" }));
  };

  const save = async () => {
    if (!form.courseId || !form.actualTeacherId || !form.date) return alert("請填寫必填欄位");
    const body = JSON.stringify({ ...form, studentCount: form.studentCount === "" ? null : Number(form.studentCount) });
    const headers = { "Content-Type": "application/json" };
    if (editing !== null) {
      await fetch(`/api/attendance/${editing}`, { method: "PUT", headers, body });
    } else {
      await fetch("/api/attendance", { method: "POST", headers, body });
    }
    setForm(EMPTY_FORM); setEditing(null); setShowForm(false); load();
  };

  const del = async (id: number) => {
    if (!confirm("確定刪除此筆紀錄？")) return;
    await fetch(`/api/attendance/${id}`, { method: "DELETE" });
    load();
  };

  const edit = (r: Attendance) => {
    setForm({ date: r.date.slice(0, 10), courseId: r.course.id, actualTeacherId: r.actualTeacher.id, studentCount: r.studentCount?.toString() ?? "", cancelled: r.cancelled, category: r.category, hours: r.hours, notes: r.notes });
    setEditing(r.id); setShowForm(true);
  };

  const fmt = (d: string) => d.slice(0, 10);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-800">✏️ 上課紀錄</h1>
          <p className="text-sm text-slate-500">共 {records.length} 筆</p>
        </div>
        <div className="flex gap-2">
          <a href={`/api/export/attendance?year=${filterYear}&month=${filterMonth}`} download
            className="bg-green-600 hover:bg-green-700 text-white font-medium px-4 py-2 rounded-lg transition-colors text-sm">
            匯出 Excel
          </a>
          <button onClick={() => { setForm({ ...EMPTY_FORM, date: today() }); setEditing(null); setShowForm(true); }}
            className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-2 rounded-lg transition-colors text-sm">
            + 新增上課紀錄
          </button>
        </div>
      </div>

      {showForm && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 mb-6">
          <h2 className="font-semibold text-slate-700 mb-4">{editing ? "編輯紀錄" : "新增上課紀錄"}</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label>上課日期 *</label>
              <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </div>
            <div className="col-span-2">
              <label>課程 *</label>
              <select value={form.courseId} onChange={(e) => onCourseChange(Number(e.target.value))}>
                <option value={0}>-- 選擇課程 --</option>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>[{c.code}] {c.school} {c.courseType} ({c.teacher.name})</option>
                ))}
              </select>
            </div>
            <div>
              <label>上課老師 *（代課時修改）</label>
              <select value={form.actualTeacherId} onChange={(e) => setForm({ ...form, actualTeacherId: Number(e.target.value) })}>
                <option value={0}>-- 選擇老師 --</option>
                {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div>
              <label>出席人數</label>
              <input type="number" value={form.studentCount} onChange={(e) => setForm({ ...form, studentCount: e.target.value })} placeholder="人數" />
            </div>
            <div>
              <label>類別</label>
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {CATS.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label>時數</label>
              <input type="number" step="0.5" value={form.hours} onChange={(e) => setForm({ ...form, hours: Number(e.target.value) })} />
            </div>
            <div>
              <label className="flex items-center gap-2 mt-6 cursor-pointer">
                <input type="checkbox" checked={form.cancelled} onChange={(e) => setForm({ ...form, cancelled: e.target.checked })} className="w-4 h-4" />
                <span className="text-sm font-medium text-slate-700">停課</span>
              </label>
            </div>
            <div className="col-span-2">
              <label>備註</label>
              <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="備註" />
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={save} className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-2 rounded-lg text-sm">儲存</button>
            <button onClick={() => { setShowForm(false); setEditing(null); }} className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium px-4 py-2 rounded-lg text-sm">取消</button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex gap-3 items-center">
          <select value={filterYear} onChange={(e) => setFilterYear(Number(e.target.value))} className="max-w-[100px]">
            {[2025, 2026, 2027].map((y) => <option key={y}>{y}</option>)}
          </select>
          <select value={filterMonth} onChange={(e) => setFilterMonth(Number(e.target.value))} className="max-w-[80px]">
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => <option key={m} value={m}>{m}月</option>)}
          </select>
          <span className="text-sm text-slate-500">共 {records.length} 筆</span>
        </div>
        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>日期</th>
                <th>課程</th>
                <th>學校</th>
                <th>上課老師</th>
                <th>出席人數</th>
                <th>類別</th>
                <th>時數</th>
                <th>狀態</th>
                <th>備註</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r) => (
                <tr key={r.id} className={r.cancelled ? "opacity-50" : ""}>
                  <td className="text-sm">{fmt(r.date)}</td>
                  <td className="font-mono text-xs text-slate-500">{r.course.code}</td>
                  <td className="font-medium">{r.course.school}</td>
                  <td>
                    <span className={r.actualTeacher.id !== r.course.teacherId ? "text-orange-600 font-medium" : ""}>
                      {r.actualTeacher.name}
                      {r.actualTeacher.id !== r.course.teacherId && <span className="ml-1 text-xs bg-orange-100 text-orange-600 px-1 rounded">代課</span>}
                    </span>
                  </td>
                  <td className="text-center">{r.studentCount ?? "-"}</td>
                  <td><span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{r.category}</span></td>
                  <td className="text-center">{r.hours}h</td>
                  <td>{r.cancelled ? <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full">停課</span> : <span className="text-xs bg-green-100 text-green-600 px-2 py-0.5 rounded-full">出課</span>}</td>
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
                <tr><td colSpan={10} className="text-center text-slate-400 py-8">本月尚無上課紀錄</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
