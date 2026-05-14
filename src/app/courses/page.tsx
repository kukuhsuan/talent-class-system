"use client";
import { useCallback, useEffect, useState } from "react";
import { useDepartment, DEPARTMENTS } from "@/lib/departmentContext";
import { expandIsoDateRange, expandWeeklyDates, formatMonthDay, parseCourseDateInput, weekdayOfIso } from "@/lib/courseDates";
import { COURSE_OPTIONS, courseLabel, normalizeDepartment, normalizeRegion, REGION_OPTIONS } from "@/lib/courseMeta";

type Teacher = { id: number; name: string };
type School = { id: number; name: string; type: string; region: string; address: string };
type Course = {
  id: number; code: string; region: string; teacher: Teacher; teacherId: number;
  school: string; schoolId: number | null; courseType: string; address: string; dayOfWeek: string; time: string;
  category: string; department: string; enrollCount: string; isActive: boolean; notes: string;
};

type DeptOption = (typeof DEPARTMENTS)[number];

function coerceDept(s: string): DeptOption {
  return normalizeDepartment(s) as DeptOption;
}

const DAYS = ["星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
const CATS = ["課後", "課內", "Demo", "試上"];
const DATE_MODES = [
  { value: "single", label: "單日" },
  { value: "multiple", label: "多日指定" },
  { value: "range", label: "日期區間" },
  { value: "weekly", label: "每週循環" },
] as const;

const EMPTY_FORM = {
  code: "", region: "", teacherId: 0, school: "", schoolId: null as number | null,
  courseType: "", address: "", dayOfWeek: "星期一", time: "", category: "課後", department: "幼兒園" as DeptOption, enrollCount: "", isActive: true, notes: "",
  dateMode: "multiple",
  scheduledDateText: "",
  scheduledDateYear: new Date().getFullYear(),
  scheduledDates: [] as string[],
  rangeStart: "",
  rangeEnd: "",
  recurringStart: "",
  recurringEnd: "",
  recurringDays: ["星期一"] as string[],
};

type CourseForm = typeof EMPTY_FORM;

function collectScheduledDates(form: CourseForm) {
  if (form.dateMode === "single") return form.scheduledDates[0] ? [form.scheduledDates[0]] : [];
  if (form.dateMode === "range") return expandIsoDateRange(form.rangeStart, form.rangeEnd);
  if (form.dateMode === "weekly") return expandWeeklyDates(form.recurringStart, form.recurringEnd, form.recurringDays);

  const parsed = parseCourseDateInput(form.scheduledDateText, Number(form.scheduledDateYear));
  return [...new Set([
    ...form.scheduledDates.map((d) => d.trim().slice(0, 10)).filter(Boolean),
    ...parsed.dates,
  ])].sort();
}

function describeCourse(c: Course) {
  return `${c.code}｜${c.school}｜${courseLabel(c.courseType)}｜${c.teacher.name}｜${c.dayOfWeek} ${c.time || ""}`;
}

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
    if (s) setForm((f) => ({
      ...f,
      schoolId: s.id,
      school: s.name,
      region: normalizeRegion(s.region),
      department: s.type ? coerceDept(s.type) : f.department,
      address: s.address || f.address || "",
    }));
    else setForm((f) => ({ ...f, schoolId: null }));
  }

  const save = async () => {
    if (!form.code.trim() || !form.school.trim() || !form.teacherId) return alert("請填寫必填欄位");
    const parsed = form.dateMode === "multiple" ? parseCourseDateInput(form.scheduledDateText, Number(form.scheduledDateYear)) : { errors: [] };
    if (parsed.errors.length > 0) return alert(`日期格式無法解析：${parsed.errors.join("、")}`);
    const scheduledDates = collectScheduledDates(form);
    if ((form.dateMode === "range" || form.dateMode === "weekly") && scheduledDates.length === 0) return alert("請確認日期區間與星期設定");
    const autoDay = scheduledDates[0] ? weekdayOfIso(scheduledDates[0]) : form.dayOfWeek;
    const targetDays = new Set((scheduledDates.length > 0 ? scheduledDates.map(weekdayOfIso) : [form.dayOfWeek]).filter(Boolean));
    const conflicts = courses
      .filter((c) => c.id !== editing && c.time && form.time && c.time.trim() === form.time.trim() && targetDays.has(c.dayOfWeek))
      .filter((c) => c.teacherId === form.teacherId || (form.schoolId ? c.schoolId === form.schoolId : c.school === form.school))
      .map((c) => `${c.teacherId === form.teacherId ? "老師撞課" : "園所撞課"}：${describeCourse(c)}`);
    if (conflicts.length > 0 && !confirm(`偵測到可能排課衝突：\n\n${conflicts.slice(0, 6).join("\n")}\n\n仍要儲存嗎？`)) return;
    const body = JSON.stringify({ ...form, region: normalizeRegion(form.region), department: normalizeDepartment(form.department), dayOfWeek: autoDay, scheduledDates });
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
    setForm({ code: c.code, region: normalizeRegion(c.region), teacherId: c.teacherId, school: c.school, schoolId: c.schoolId,
      courseType: c.courseType, address: c.address || "", dayOfWeek: c.dayOfWeek, time: c.time, category: c.category,
      department: coerceDept(c.department || "幼兒園"), enrollCount: c.enrollCount, isActive: c.isActive, notes: c.notes,
      dateMode: "multiple", scheduledDateText: "", scheduledDateYear: new Date().getFullYear(), scheduledDates: [],
      rangeStart: "", rangeEnd: "", recurringStart: "", recurringEnd: "", recurringDays: [c.dayOfWeek || "星期一"] });
    setEditing(c.id); setShowForm(true);
  };

  const regions = [...new Set(courses.map((c) => normalizeRegion(c.region)).filter(Boolean))].sort();
  const filtered = courses.filter((c) => !filterRegion || normalizeRegion(c.region) === filterRegion);
  const parsedDates = form.dateMode === "multiple" ? parseCourseDateInput(form.scheduledDateText, Number(form.scheduledDateYear)) : { dates: [], errors: [] };
  const previewDates = collectScheduledDates(form);

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
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 md:p-6 mb-6">
          <h2 className="font-semibold text-slate-700 mb-4">{editing != null ? "編輯課程" : "新增課程"}</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
            <div className="md:col-span-4 text-xs font-semibold text-slate-500 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">基本資料</div>
            <div>
              <label>課程編號 *</label>
              <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="C050" />
            </div>
            <div className="md:col-span-2">
              <label>園所名稱 *</label>
              <select value={form.schoolId ?? ""} onChange={(e) => selectSchool(Number(e.target.value))}>
                <option value="">-- 從園所管理選擇，或下方手動輸入 --</option>
                {schools.map((s) => <option key={s.id} value={s.id}>{s.region ? `[${normalizeRegion(s.region)}] ` : ""}{s.type ? `${normalizeDepartment(s.type)}｜` : ""}{s.name}</option>)}
              </select>
              {form.schoolId && (
                <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  <div className="font-medium text-slate-900">{form.school}</div>
                  <div className="mt-1 flex flex-wrap gap-2 text-xs text-slate-500">
                    {form.region && <span>{normalizeRegion(form.region)}</span>}
                    {form.department && <span>{normalizeDepartment(form.department)}</span>}
                    {form.address && <span className="break-all">{form.address}</span>}
                  </div>
                </div>
              )}
            </div>
            {!form.schoolId && <div>
              <label>手動輸入園所名稱 *</label>
              <input value={form.school} onChange={(e) => setForm({ ...form, school: e.target.value })} placeholder="學校簡稱" />
            </div>}
            <div>
              <label>地區</label>
              <select value={normalizeRegion(form.region)} onChange={(e) => setForm({ ...form, region: e.target.value })}>
                <option value="">-- 選擇地區 --</option>
                {REGION_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div className="md:col-span-4 text-xs font-semibold text-slate-500 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">課程資訊</div>
            <div className="md:col-span-2">
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
              <select value={form.courseType} onChange={(e) => setForm({ ...form, courseType: e.target.value })}>
                <option value="">-- 選擇課程 --</option>
                {COURSE_OPTIONS.map((c) => <option key={c.code} value={c.code}>{c.label}（{c.code}）</option>)}
                {form.courseType && !COURSE_OPTIONS.some((c) => c.code === form.courseType) && <option value={form.courseType}>{courseLabel(form.courseType)}（既有資料）</option>}
              </select>
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
              <select value={normalizeDepartment(form.department)} onChange={(e) => setForm({ ...form, department: coerceDept(e.target.value) })}>
                {DEPARTMENTS.map((d) => <option key={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <label>報名人數</label>
              <input value={form.enrollCount} onChange={(e) => setForm({ ...form, enrollCount: e.target.value })} placeholder="10人" />
            </div>
            <div className="md:col-span-2">
              <label>備註</label>
              <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
            <div className="md:col-span-4 text-xs font-semibold text-slate-500 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">實際日期</div>
            <div className="md:col-span-4 border border-amber-100 bg-amber-50/30 rounded-lg p-4">
              <label className="block text-sm font-medium text-slate-700 mb-2">實際上課日期（選填）</label>
              <p className="text-xs text-slate-500 mb-3">儲存後會建立對應日期的上課紀錄，週課表會依實際日期顯示。</p>
              <div className="flex flex-wrap gap-2 mb-4">
                {DATE_MODES.map((m) => (
                  <button key={m.value} type="button" onClick={() => setForm({ ...form, dateMode: m.value })}
                    className={`rounded-full border px-3 py-1.5 text-xs font-medium ${form.dateMode === m.value ? "bg-amber-700 text-white border-amber-700" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}>
                    {m.label}
                  </button>
                ))}
              </div>

              {form.dateMode === "single" && (
                <div className="max-w-xs">
                  <label className="text-xs">上課日期</label>
                  <input type="date" value={form.scheduledDates[0] ?? ""} onChange={(e) => setForm({ ...form, scheduledDates: [e.target.value] })} />
                </div>
              )}

              {form.dateMode === "multiple" && (
                <>
                  <div className="grid md:grid-cols-[120px_1fr] gap-3">
                    <div>
                      <label className="text-xs">年份</label>
                      <input type="number" value={form.scheduledDateYear} onChange={(e) => setForm({ ...form, scheduledDateYear: Number(e.target.value) })} />
                    </div>
                    <div>
                      <label className="text-xs">日期字串</label>
                      <input value={form.scheduledDateText} onChange={(e) => setForm({ ...form, scheduledDateText: e.target.value })} placeholder="7/1、7/6、8、9、10、7/8、15、22、29" />
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
                </>
              )}

              {form.dateMode === "range" && (
                <div className="grid md:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs">開始日期</label>
                    <input type="date" value={form.rangeStart} onChange={(e) => setForm({ ...form, rangeStart: e.target.value })} />
                  </div>
                  <div>
                    <label className="text-xs">結束日期</label>
                    <input type="date" value={form.rangeEnd} onChange={(e) => setForm({ ...form, rangeEnd: e.target.value })} />
                  </div>
                </div>
              )}

              {form.dateMode === "weekly" && (
                <div className="space-y-3">
                  <div className="grid md:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs">開始日期</label>
                      <input type="date" value={form.recurringStart} onChange={(e) => setForm({ ...form, recurringStart: e.target.value })} />
                    </div>
                    <div>
                      <label className="text-xs">結束日期</label>
                      <input type="date" value={form.recurringEnd} onChange={(e) => setForm({ ...form, recurringEnd: e.target.value })} />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs">每週星期</label>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {DAYS.map((d) => (
                        <label key={d} className={`cursor-pointer rounded-full border px-3 py-1.5 text-xs ${form.recurringDays.includes(d) ? "border-amber-700 bg-amber-700 text-white" : "border-slate-200 bg-white text-slate-600"}`}>
                          <input type="checkbox" className="sr-only" checked={form.recurringDays.includes(d)} onChange={(e) => {
                            const next = e.target.checked ? [...form.recurringDays, d] : form.recurringDays.filter((x) => x !== d);
                            setForm({ ...form, recurringDays: next });
                          }} />
                          {d.replace("星期", "週")}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              )}
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
            <div className="md:col-span-4 flex items-end pb-2">
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
          {[...new Set([...REGION_OPTIONS, ...regions])].map((r) => <button key={r} onClick={() => setFilterRegion(r)} className={`px-3 py-1 rounded-full text-xs border ${filterRegion === r ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600"}`}>{r}</button>)}
          <span className="text-sm text-slate-500 self-center ml-2">共 {filtered.length} 門</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1220px] text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="w-24 px-4 py-3 text-left font-semibold">編號</th>
                <th className="w-24 px-4 py-3 text-left font-semibold">地區</th>
                <th className="w-40 px-4 py-3 text-left font-semibold">學校</th>
                <th className="w-32 px-4 py-3 text-left font-semibold">老師</th>
                <th className="w-36 px-4 py-3 text-left font-semibold">項目</th>
                <th className="w-28 px-4 py-3 text-left font-semibold">星期</th>
                <th className="w-32 px-4 py-3 text-left font-semibold">時間</th>
                <th className="min-w-64 px-4 py-3 text-left font-semibold">地址</th>
                <th className="w-24 px-4 py-3 text-left font-semibold">類別</th>
                <th className="w-28 px-4 py-3 text-left font-semibold">報名人數</th>
                <th className="w-20 px-4 py-3 text-left font-semibold">狀態</th>
                <th className="w-28 px-4 py-3 text-left font-semibold">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50/70">
                  <td className="px-4 py-3 font-mono text-xs text-slate-500 whitespace-nowrap">{c.code}</td>
                  <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{normalizeRegion(c.region)}</td>
                  <td className="px-4 py-3 font-medium text-slate-900">{c.school}</td>
                  <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{c.teacher.name}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 whitespace-nowrap">
                      <span className="font-medium text-slate-900">{courseLabel(c.courseType)}</span>
                      {courseLabel(c.courseType) !== c.courseType && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">{c.courseType}</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">{c.dayOfWeek}</td>
                  <td className="px-4 py-3 text-xs text-slate-700 whitespace-nowrap">{c.time || "—"}</td>
                  <td className="px-4 py-3 text-xs leading-5 text-slate-500 whitespace-normal break-words">{c.address || "—"}</td>
                  <td className="px-4 py-3"><span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${catColor[c.category] ?? "bg-slate-100 text-slate-600"}`}>{c.category}</span></td>
                  <td className="px-4 py-3 text-sm text-slate-700 whitespace-nowrap">{c.enrollCount || "—"}</td>
                  <td className="px-4 py-3"><span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${c.isActive ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"}`}>{c.isActive ? "開課" : "停課"}</span></td>
                  <td className="px-4 py-3">
                    <div className="flex gap-3 whitespace-nowrap">
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
