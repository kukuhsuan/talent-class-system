"use client";
import { useCallback, useEffect, useState } from "react";
import { useDepartment, DEPARTMENTS } from "@/lib/departmentContext";

type Teacher = { id: number; name: string };
type School = { id: number; name: string; region: string };
type Course = {
  id: number; code: string; region: string; teacher: Teacher; teacherId: number;
  school: string; schoolId: number | null; courseType: string; dayOfWeek: string; time: string;
  category: string; department: string; enrollCount: string; isActive: boolean; notes: string;
};

type DeptOption = (typeof DEPARTMENTS)[number];

function coerceDept(s: string): DeptOption {
  return (DEPARTMENTS as readonly string[]).includes(s) ? (s as DeptOption) : "幼兒園";
}

const DAYS = ["星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
const CATS = ["課後", "課內", "Demo", "試上"];

const EMPTY_FORM = {
  code: "", region: "", teacherId: 0, school: "", schoolId: null as number | null,
  courseType: "", dayOfWeek: "星期一", time: "", category: "課後", department: "幼兒園" as DeptOption, enrollCount: "", isActive: true, notes: "",
  scheduledDates: [] as string[],
};

export default function CoursesPage() {
  const { dept } = useDepartment();
  const [courses, setCourses] = useState<Course[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [form, setForm] = useState({ ...EMPTY_FORM, department: coerceDept(dept || "幼兒園") });
  const [editing, setEditing] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [filterRegion, setFilterRegion] = useState("");

  const load = useCallback(
    () =>
      Promise.all([
        fetch(`/api/courses${dept ? `?dept=${encodeURIComponent(dept)}` : ""}`).then((r) => r.json()),
        fetch("/api/teachers").then((r) => r.json()),
        fetch("/api/schools").then((r) => r.json()),
      ]).then(([c, t, s]) => { setCourses(c); setTeachers(t); setSchools(s); }),
    [dept],
  );

  useEffect(() => { load(); }, [load]);

  function selectSchool(schoolId: number) {
    const s = schools.find((s) => s.id === schoolId);
    if (s) setForm((f) => ({ ...f, schoolId: s.id, school: s.name, region: s.region }));
    else setForm((f) => ({ ...f, schoolId: null }));
  }

  const save = async () => {
    if (!form.code.trim() || !form.school.trim() || !form.teacherId) return alert("請填寫必填欄位");
    const scheduledDates = [...new Set(form.scheduledDates.map((d) => d.trim().slice(0, 10)).filter(Boolean))];
    const body = JSON.stringify({ ...form, scheduledDates: editing === null ? scheduledDates : [] });
    const headers = { "Content-Type": "application/json" };
    if (editing !== null) {
      await fetch(`/api/courses/${editing}`, { method: "PUT", headers, body });
    } else {
      await fetch("/api/courses", { method: "POST", headers, body });
    }
    setForm({ ...EMPTY_FORM, department: coerceDept(dept || "幼兒園") }); setEditing(null); setShowForm(false); load();
  };

  const del = async (id: number, code: string) => {
    if (!confirm(`確定刪除課程「${code}」？`)) return;
    await fetch(`/api/courses/${id}`, { method: "DELETE" });
    load();
  };

  const edit = (c: Course) => {
    setForm({ code: c.code, region: c.region, teacherId: c.teacherId, school: c.school, schoolId: c.schoolId,
      courseType: c.courseType, dayOfWeek: c.dayOfWeek, time: c.time, category: c.category,
      department: coerceDept(c.department || "幼兒園"), enrollCount: c.enrollCount, isActive: c.isActive, notes: c.notes, scheduledDates: [] });
    setEditing(c.id); setShowForm(true);
  };

  const regions = [...new Set(courses.map((c) => c.region).filter(Boolean))].sort();
  const filtered = courses.filter((c) => !filterRegion || c.region === filterRegion);

  const catColor: Record<string, string> = {
    課後: "bg-blue-100 text-blue-700", 課內: "bg-green-100 text-green-700",
    Demo: "bg-orange-100 text-orange-700", 試上: "bg-purple-100 text-purple-700",
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-800">課程排班</h1>
          <p className="text-sm text-slate-500">共 {courses.length} 門課程</p>
        </div>
        <button onClick={() => { setForm({ ...EMPTY_FORM, department: coerceDept(dept || "幼兒園") }); setEditing(null); setShowForm(true); }}
          className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-2 rounded-lg transition-colors text-sm">
          + 新增課程
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 mb-6">
          <h2 className="font-semibold text-slate-700 mb-4">{editing != null ? "編輯課程" : "新增課程"}</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label>課程編號 *</label>
              <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="C050" />
            </div>
            <div>
              <label>園所（從資料庫選）</label>
              <select value={form.schoolId ?? ""} onChange={(e) => selectSchool(Number(e.target.value))}>
                <option value="">-- 選擇園所 --</option>
                {schools.map((s) => <option key={s.id} value={s.id}>{s.region ? `[${s.region}] ` : ""}{s.name}</option>)}
              </select>
            </div>
            <div>
              <label>學校名稱 * <span className="text-xs text-gray-400">（可手填）</span></label>
              <input value={form.school} onChange={(e) => setForm({ ...form, school: e.target.value })} placeholder="學校簡稱" />
            </div>
            <div>
              <label>地區</label>
              <input value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} placeholder="台北市" />
            </div>
            <div>
              <label>負責老師 *</label>
              <select value={form.teacherId} onChange={(e) => setForm({ ...form, teacherId: Number(e.target.value) })}>
                <option value={0}>-- 選擇老師 --</option>
                {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div>
              <label>課程項目</label>
              <input value={form.courseType} onChange={(e) => setForm({ ...form, courseType: e.target.value })} placeholder="FT / BK / G / D ..." />
            </div>
            <div>
              <label>星期幾</label>
              <select value={form.dayOfWeek} onChange={(e) => setForm({ ...form, dayOfWeek: e.target.value })}>
                {DAYS.map((d) => <option key={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <label>上課時間</label>
              <input value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} placeholder="16:00-17:00" />
            </div>
            <div>
              <label>類別</label>
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {CATS.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label>部門</label>
              <select value={form.department} onChange={(e) => setForm({ ...form, department: coerceDept(e.target.value) })}>
                {DEPARTMENTS.map((d) => <option key={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <label>報名人數</label>
              <input value={form.enrollCount} onChange={(e) => setForm({ ...form, enrollCount: e.target.value })} placeholder="10人" />
            </div>
            <div className="col-span-2">
              <label>備註</label>
              <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
            {editing === null && (
              <div className="col-span-2 md:col-span-4 border-t border-slate-100 pt-4 mt-1">
                <label className="block text-sm font-medium text-slate-700 mb-2">預排上課日（選填，可多日、可不連續）</label>
                <p className="text-xs text-slate-500 mb-2">儲存後會自動建立對應的上課紀錄；若留空則僅建立課程排班，之後請到「上課紀錄」手動新增。</p>
                <div className="flex flex-col gap-2">
                  {form.scheduledDates.length === 0 && (
                    <button type="button" onClick={() => setForm((f) => ({ ...f, scheduledDates: [""] }))}
                      className="self-start text-sm text-blue-600 hover:underline">+ 加入日期</button>
                  )}
                  {form.scheduledDates.map((d, i) => (
                    <div key={i} className="flex flex-wrap items-center gap-2">
                      <input type="date" value={d} onChange={(e) => {
                        const next = [...form.scheduledDates];
                        next[i] = e.target.value;
                        setForm({ ...form, scheduledDates: next });
                      }} className="text-sm" />
                      <button type="button" onClick={() => setForm((f) => ({ ...f, scheduledDates: f.scheduledDates.filter((_, j) => j !== i) }))}
                        className="text-xs text-red-500 hover:underline">移除</button>
                    </div>
                  ))}
                  {form.scheduledDates.length > 0 && (
                    <button type="button" onClick={() => setForm((f) => ({ ...f, scheduledDates: [...f.scheduledDates, ""] }))}
                      className="self-start text-sm text-blue-600 hover:underline">+ 再加一個日期</button>
                  )}
                </div>
              </div>
            )}
            <div className="flex items-end pb-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} className="w-4 h-4" />
                <span className="text-sm font-medium text-slate-700">開課中</span>
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
        <div className="p-4 border-b border-slate-100 flex gap-3 flex-wrap">
          <button onClick={() => setFilterRegion("")} className={`px-3 py-1 rounded-full text-xs border ${!filterRegion ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600"}`}>全部</button>
          {regions.map((r) => <button key={r} onClick={() => setFilterRegion(r)} className={`px-3 py-1 rounded-full text-xs border ${filterRegion === r ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600"}`}>{r}</button>)}
          <span className="text-sm text-slate-500 self-center ml-2">共 {filtered.length} 門</span>
        </div>
        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>編號</th>
                <th>地區</th>
                <th>學校</th>
                <th>老師</th>
                <th>項目</th>
                <th>星期</th>
                <th>時間</th>
                <th>類別</th>
                <th>報名人數</th>
                <th>狀態</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id}>
                  <td className="font-mono text-xs text-slate-500">{c.code}</td>
                  <td>{c.region}</td>
                  <td className="font-medium">{c.school}</td>
                  <td>{c.teacher.name}</td>
                  <td>{c.courseType}</td>
                  <td className="text-xs">{c.dayOfWeek}</td>
                  <td className="text-xs text-slate-500">{c.time}</td>
                  <td><span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${catColor[c.category] ?? "bg-slate-100 text-slate-600"}`}>{c.category}</span></td>
                  <td className="text-sm">{c.enrollCount}</td>
                  <td><span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${c.isActive ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"}`}>{c.isActive ? "開課" : "停課"}</span></td>
                  <td>
                    <div className="flex gap-2">
                      <button onClick={() => edit(c)} className="text-blue-600 hover:text-blue-800 text-sm font-medium">編輯</button>
                      <button onClick={() => del(c.id, c.code)} className="text-red-500 hover:text-red-700 text-sm font-medium">刪除</button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={11} className="text-center text-slate-400 py-8">尚無課程資料</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
