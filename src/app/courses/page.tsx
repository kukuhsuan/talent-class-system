"use client";
import { useCallback, useEffect, useState } from "react";
import { useDepartment, DEPARTMENTS } from "@/lib/departmentContext";
import { formatMonthDay, parseCourseDateInput, weekdayOfIso } from "@/lib/courseDates";

type Teacher = { id: number; name: string };
type School = { id: number; name: string; region: string; address: string };
type Course = {
  id: number; code: string; region: string; teacher: Teacher; teacherId: number;
  school: string; schoolId: number | null; courseType: string; address: string; dayOfWeek: string; time: string;
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
  courseType: "", address: "", dayOfWeek: "星期一", time: "", category: "課後", department: "幼兒園" as DeptOption, enrollCount: "", isActive: true, notes: "",
  scheduledDateText: "",
  scheduledDateYear: new Date().getFullYear(),
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
    if (s) setForm((f) => ({ ...f, schoolId: s.id, school: s.name, region: s.region, address: f.address || s.address || "" }));
    else setForm((f) => ({ ...f, schoolId: null }));
  }

  const save = async () => {
    if (!form.code.trim() || !form.school.trim() || !form.teacherId) return alert("請填寫必填欄位");
    const parsed = parseCourseDateInput(form.scheduledDateText, Number(form.scheduledDateYear));
    if (parsed.errors.length > 0) return alert(`日期格式無法解析：${parsed.errors.join("、")}`);
    const scheduledDates = [...new Set([
      ...form.scheduledDates.map((d) => d.trim().slice(0, 10)).filter(Boolean),
      ...parsed.dates,
    ])].sort();
    const autoDay = scheduledDates[0] ? weekdayOfIso(scheduledDates[0]) : form.dayOfWeek;
    const body = JSON.stringify({ ...form, dayOfWeek: autoDay, scheduledDates });
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
      courseType: c.courseType, address: c.address || "", dayOfWeek: c.dayOfWeek, time: c.time, category: c.category,
      department: coerceDept(c.department || "幼兒園"), enrollCount: c.enrollCount, isActive: c.isActive, notes: c.notes,
      scheduledDateText: "", scheduledDateYear: new Date().getFullYear(), scheduledDates: [] });
    setEditing(c.id); setShowForm(true);
  };

  const regions = [...new Set(courses.map((c) => c.region).filter(Boolean))].sort();
  const filtered = courses.filter((c) => !filterRegion || c.region === filterRegion);
  const parsedDates = parseCourseDateInput(form.scheduledDateText, Number(form.scheduledDateYear));
  const previewDates = [...new Set([...form.scheduledDates.filter(Boolean), ...parsedDates.dates])].sort();

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
            <div className="col-span-2">
              <label>上課地址</label>
              <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="可貼完整地址，之後可連 Google Maps" />
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
            <div className="col-span-2 md:col-span-4 border-t border-slate-100 pt-4 mt-1">
              <label className="block text-sm font-medium text-slate-700 mb-2">實際上課日期（選填，可多日、區間、不連續）</label>
              <p className="text-xs text-slate-500 mb-2">範例：7/1、7/1-7/3、7/6、8、9、10、7/8、15、22、29。儲存後會建立對應日期的上課紀錄。</p>
              <div className="grid md:grid-cols-[120px_1fr] gap-3">
                <div>
                  <label className="text-xs">年份</label>
                  <input type="number" value={form.scheduledDateYear} onChange={(e) => setForm({ ...form, scheduledDateYear: Number(e.target.value) })} />
                </div>
                <div>
                  <label className="text-xs">日期字串</label>
                  <input value={form.scheduledDateText} onChange={(e) => setForm({ ...form, scheduledDateText: e.target.value })} placeholder="7/1-7/3、7/8、15、22、29" />
                </div>
              </div>
              <div className="flex flex-col gap-2 mt-3">
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
                <button type="button" onClick={() => setForm((f) => ({ ...f, scheduledDates: [...f.scheduledDates, ""] }))}
                  className="self-start text-sm text-blue-600 hover:underline">+ 加入單日選擇</button>
              </div>
              {previewDates.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {previewDates.map((d) => (
                    <span key={d} className="rounded-full bg-amber-50 text-amber-800 border border-amber-200 px-2 py-1 text-xs">
                      {formatMonthDay(d)} {weekdayOfIso(d).replace("星期", "週")}
                    </span>
                  ))}
                </div>
              )}
              {parsedDates.errors.length > 0 && <p className="mt-2 text-xs text-red-500">無法解析：{parsedDates.errors.join("、")}</p>}
            </div>
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
                <th>地址</th>
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
                  <td className="text-xs text-slate-500 max-w-48 truncate">{c.address}</td>
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
                <tr><td colSpan={12} className="text-center text-slate-400 py-8">尚無課程資料</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
