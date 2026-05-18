"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useDepartment } from "@/lib/departmentContext";
import { CATEGORY_OPTIONS, courseLabel, normalizeCategory } from "@/lib/courseMeta";
import { useScrollToFormOnEdit } from "@/lib/useScrollToFormOnEdit";

type Teacher = { id: number; name: string };
type Course = { id: number; code: string; school: string; courseType: string; teacher: Teacher; teacherId: number; category: string };
type Attendance = {
  id: number; date: string; course: Course; actualTeacher: Teacher;
  studentCount: number | null; cancelled: boolean; cancelReason: string; makeupDate: string | null; makeupDone: boolean;
  category: string; hours: number; notes: string;
};

const today = () => new Date().toISOString().slice(0, 10);
const EMPTY_FORM = {
  date: today(), courseId: 0, actualTeacherId: 0,
  studentCount: "", cancelled: false, cancelReason: "", makeupDate: "", makeupDone: false, category: "課後", hours: 1, notes: "",
  extraDates: [] as string[],
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
  const formRef = useRef<HTMLDivElement | null>(null);
  const firstInputRef = useRef<HTMLInputElement | null>(null);
  const scrollToFormOnEdit = useScrollToFormOnEdit(formRef, firstInputRef);

  const load = useCallback(() => {
    const params = new URLSearchParams({ year: String(filterYear), month: String(filterMonth) });
    if (dept) params.set("dept", dept);
    Promise.all([
      fetch(`/api/attendance?${params}`).then((r) => r.json()),
      fetch(`/api/courses${dept ? `?dept=${encodeURIComponent(dept)}` : ""}`).then((r) => r.json()),
      fetch("/api/teachers").then((r) => r.json()),
    ]).then(([a, c, t]) => { setRecords(a); setCourses(c); setTeachers(t); });
  }, [filterYear, filterMonth, dept]);

  useEffect(() => { load(); }, [load]);

  const onCourseChange = (courseId: number) => {
    const c = courses.find((x) => x.id === courseId);
    setForm((f) => ({ ...f, courseId, actualTeacherId: c?.teacherId ?? 0, category: normalizeCategory(c?.category) }));
  };

  const save = async () => {
    if (!form.courseId || !form.actualTeacherId || !form.date) return alert("請填寫必填欄位");
    const headers = { "Content-Type": "application/json" };
    if (editing !== null) {
      const { extraDates: _x, ...rest } = form;
      void _x;
      const body = JSON.stringify({ ...rest, studentCount: form.studentCount === "" ? null : Number(form.studentCount) });
      await fetch(`/api/attendance/${editing}`, { method: "PUT", headers, body });
    } else {
      const dateSet = [...new Set([form.date, ...form.extraDates].map((d) => d.slice(0, 10)).filter(Boolean))];
      const { extraDates: _x, date: _d, ...rest } = form;
      void _x; void _d;
      const body = JSON.stringify({
        ...rest,
        dates: dateSet,
        studentCount: form.studentCount === "" ? null : Number(form.studentCount),
      });
      const res = await fetch("/api/attendance", { method: "POST", headers, body });
      const data = await res.json();
      if (data.created != null) {
        const parts = [`已建立 ${data.created} 筆上課紀錄`];
        if (data.skipped > 0) parts.push(`略過 ${data.skipped} 筆重複日期`);
        alert(parts.join("；"));
      }
    }
    setForm(EMPTY_FORM); setEditing(null); setShowForm(false); load();
  };

  const del = async (id: number) => {
    if (!confirm("確定刪除此筆紀錄？")) return;
    await fetch(`/api/attendance/${id}`, { method: "DELETE" });
    load();
  };

  const edit = (r: Attendance) => {
    setForm({ date: r.date.slice(0, 10), courseId: r.course.id, actualTeacherId: r.actualTeacher.id, studentCount: r.studentCount?.toString() ?? "", cancelled: r.cancelled, cancelReason: r.cancelReason ?? "", makeupDate: r.makeupDate?.slice(0, 10) ?? "", makeupDone: r.makeupDone ?? false, category: normalizeCategory(r.category), hours: r.hours, notes: r.notes, extraDates: [] });
    setEditing(r.id); setShowForm(true);
    scrollToFormOnEdit();
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
          <button onClick={() => { setForm({ ...EMPTY_FORM, date: today(), extraDates: [] }); setEditing(null); setShowForm(true); }}
            className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-2 rounded-lg transition-colors text-sm">
            + 新增上課紀錄
          </button>
        </div>
      </div>

      {showForm && (
        <div ref={formRef} className={`bg-white rounded-xl border shadow-sm p-5 mb-6 ${editing ? "border-blue-200 ring-2 ring-blue-50" : "border-slate-200"}`}>
          <h2 className="font-semibold text-slate-700 mb-4">{editing ? "正在編輯上課紀錄" : "新增上課紀錄"}</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label>上課日期 *</label>
              <input ref={firstInputRef} type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </div>
            {editing === null && (
              <div className="md:col-span-3">
                <label className="block text-sm font-medium text-slate-700 mb-1">其他上課日（選填，可不連續）</label>
                <p className="text-xs text-slate-500 mb-2">與上方日期合併建立多筆紀錄；同日同課程已存在則略過。</p>
                {form.extraDates.length === 0 && (
                  <button type="button" onClick={() => setForm((f) => ({ ...f, extraDates: [""] }))}
                    className="text-sm text-blue-600 hover:underline">+ 加入其他日期</button>
                )}
                <div className="flex flex-col gap-2 mt-1">
                  {form.extraDates.map((d, i) => (
                    <div key={i} className="flex flex-wrap items-center gap-2">
                      <input type="date" value={d} onChange={(e) => {
                        const next = [...form.extraDates];
                        next[i] = e.target.value;
                        setForm({ ...form, extraDates: next });
                      }} />
                      <button type="button" onClick={() => setForm((f) => ({ ...f, extraDates: f.extraDates.filter((_, j) => j !== i) }))}
                        className="text-xs text-red-500 hover:underline">移除</button>
                    </div>
                  ))}
                  {form.extraDates.length > 0 && (
                    <button type="button" onClick={() => setForm((f) => ({ ...f, extraDates: [...f.extraDates, ""] }))}
                      className="self-start text-sm text-blue-600 hover:underline">+ 再加一個日期</button>
                  )}
                </div>
              </div>
            )}
            <div className="md:col-span-2">
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
                {CATEGORY_OPTIONS.map((c) => <option key={c}>{c}</option>)}
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
            {form.cancelled && (
              <>
                <div>
                  <label>停課原因</label>
                  <input value={form.cancelReason} onChange={(e) => setForm({ ...form, cancelReason: e.target.value })} placeholder="颱風假、園所活動..." />
                </div>
                <div>
                  <label>補課日期</label>
                  <input type="date" value={form.makeupDate} onChange={(e) => setForm({ ...form, makeupDate: e.target.value })} />
                </div>
                <div>
                  <label className="flex items-center gap-2 mt-6 cursor-pointer">
                    <input type="checkbox" checked={form.makeupDone} onChange={(e) => setForm({ ...form, makeupDone: e.target.checked })} className="w-4 h-4" />
                    <span className="text-sm font-medium text-slate-700">已補課</span>
                  </label>
                </div>
              </>
            )}
            <div className="md:col-span-2">
              <label>備註</label>
              <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="備註" />
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={save} className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-3 md:py-2 rounded-lg text-sm">儲存</button>
            <button onClick={() => { setShowForm(false); setEditing(null); }} className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium px-4 py-3 md:py-2 rounded-lg text-sm">取消</button>
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
        <div className="md:hidden divide-y divide-slate-100">
          {records.map((r) => {
            const isSubstitute = r.actualTeacher.id !== r.course.teacherId;
            return (
              <div key={r.id} className={`p-4 ${r.cancelled ? "opacity-60" : ""}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">{fmt(r.date)}</div>
                    <div className="mt-1 text-xs text-slate-500">{r.course.code}｜{courseLabel(r.course.courseType)}</div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    {r.cancelled ? <span className="text-xs bg-red-100 text-red-600 px-2 py-1 rounded-full">停課</span> : <span className="text-xs bg-green-100 text-green-600 px-2 py-1 rounded-full">出課</span>}
                    {r.cancelled && r.makeupDate && <span className={`text-[11px] px-2 py-0.5 rounded-full ${r.makeupDone ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>{r.makeupDone ? "已補課" : `補 ${r.makeupDate.slice(5, 10)}`}</span>}
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-lg bg-slate-50 px-3 py-2"><div className="text-xs text-slate-400">學校</div><div className="font-medium text-slate-800">{r.course.school}</div></div>
                  <div className="rounded-lg bg-slate-50 px-3 py-2">
                    <div className="text-xs text-slate-400">老師</div>
                    <div className="font-medium text-slate-800">{r.actualTeacher.name}</div>
                    {isSubstitute && <div className="mt-1 inline-flex rounded-full bg-orange-100 px-2 py-0.5 text-[11px] text-orange-700">代課</div>}
                  </div>
                  <div className="rounded-lg bg-slate-50 px-3 py-2"><div className="text-xs text-slate-400">出席人數</div><div className="font-medium">{r.studentCount ?? "-"}</div></div>
                  <div className="rounded-lg bg-slate-50 px-3 py-2"><div className="text-xs text-slate-400">類別 / 時數</div><div className="font-medium">{normalizeCategory(r.category)}｜{r.hours}h</div></div>
                </div>
                {(r.cancelReason || r.notes) && <div className="mt-3 text-xs text-slate-500">{r.cancelReason || r.notes}</div>}
                <div className="mt-4 flex gap-4">
                  <button onClick={() => edit(r)} className="text-blue-600 hover:text-blue-800 text-sm font-medium">編輯</button>
                  <button onClick={() => del(r.id)} className="text-red-500 hover:text-red-700 text-sm font-medium">刪除</button>
                </div>
              </div>
            );
          })}
          {records.length === 0 && <div className="py-8 text-center text-slate-400">本月尚無上課紀錄</div>}
        </div>
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[1120px] text-sm">
            <thead>
              <tr className="bg-slate-50 text-slate-600">
                <th className="px-4 py-3 text-left font-semibold">日期</th>
                <th className="px-4 py-3 text-left font-semibold">課程</th>
                <th className="px-4 py-3 text-left font-semibold">學校</th>
                <th className="px-4 py-3 text-left font-semibold">上課老師</th>
                <th className="px-4 py-3 text-center font-semibold">出席人數</th>
                <th className="px-4 py-3 text-left font-semibold">類別</th>
                <th className="px-4 py-3 text-center font-semibold">時數</th>
                <th className="px-4 py-3 text-left font-semibold">狀態</th>
                <th className="px-4 py-3 text-left font-semibold">備註</th>
                <th className="px-4 py-3 text-left font-semibold">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {records.map((r) => {
                const isSubstitute = r.actualTeacher.id !== r.course.teacherId;
                return (
                <tr key={r.id} className={`${r.cancelled ? "opacity-50" : ""} hover:bg-slate-50/70`}>
                  <td className="px-4 py-4 text-sm whitespace-nowrap">{fmt(r.date)}</td>
                  <td className="px-4 py-4">
                    <div className="font-medium text-slate-900">{courseLabel(r.course.courseType)}</div>
                    <div className="font-mono text-xs text-slate-400">{r.course.code}</div>
                  </td>
                  <td className="px-4 py-4 font-medium text-slate-800">{r.course.school}</td>
                  <td className="px-4 py-4">
                    <div className={isSubstitute ? "text-orange-700 font-medium" : "text-slate-700"}>{r.actualTeacher.name}</div>
                    {isSubstitute && <div className="mt-1 inline-flex text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">代課</div>}
                  </td>
                  <td className="px-4 py-4 text-center">{r.studentCount ?? "-"}</td>
                  <td className="px-4 py-4"><span className="text-xs bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full">{normalizeCategory(r.category)}</span></td>
                  <td className="px-4 py-4 text-center">{r.hours}h</td>
                  <td className="px-4 py-4">
                    <div className="flex flex-col items-start gap-1">
                      {r.cancelled ? <span className="text-xs bg-red-100 text-red-600 px-2.5 py-1 rounded-full">停課</span> : <span className="text-xs bg-green-100 text-green-600 px-2.5 py-1 rounded-full">出課</span>}
                      {r.cancelled && r.makeupDate && <span className={`text-[11px] px-2 py-0.5 rounded-full ${r.makeupDone ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>{r.makeupDone ? "已補課" : `補課 ${r.makeupDate.slice(0, 10)}`}</span>}
                    </div>
                  </td>
                  <td className="px-4 py-4 max-w-[220px] truncate text-xs text-slate-500" title={r.cancelReason || r.notes || ""}>{r.cancelReason || r.notes || "-"}</td>
                  <td className="px-4 py-4">
                    <div className="flex gap-4 whitespace-nowrap">
                      <button onClick={() => edit(r)} className="text-blue-600 hover:text-blue-800 text-sm font-medium">編輯</button>
                      <button onClick={() => del(r.id)} className="text-red-500 hover:text-red-700 text-sm font-medium">刪除</button>
                    </div>
                  </td>
                </tr>
              );})}
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
