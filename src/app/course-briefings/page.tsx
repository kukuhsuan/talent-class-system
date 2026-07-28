"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { taipeiDateIso } from "@/lib/courseDates";
import { useToast } from "@/lib/useToast";
import { Toast } from "@/components/Toast";
import { SearchableSelect } from "@/components/SearchableSelect";

type Teacher = { id: number; name: string };
type Course = {
  id: number; code: string; school: string; courseType: string; time: string;
  teacher: Teacher; teacherId: number; assistantTeacher?: Teacher | null; assistantTeacherId?: number | null;
};
type Briefing = {
  id: number; courseId: number; teacherId: number; targetDate: string; content: string; equipmentNote: string;
  status: string; ackAt: string | null; createdBy: string; createdAt: string;
  immediateSentAt: string | null; dayBeforeSentAt: string | null; sameDaySentAt: string | null;
  courseCode: string; school: string; courseType: string; courseTime: string; teacherName: string;
};

const EMPTY = { courseId: 0, teacherId: 0, targetDate: taipeiDateIso(), content: "", equipmentNote: "" };

export default function CourseBriefingsPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [items, setItems] = useState<Briefing[]>([]);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const { toast, showToast } = useToast();

  const load = useCallback(async () => {
    const from = taipeiDateIso(new Date(Date.now() - 7 * 86400000));
    const to = taipeiDateIso(new Date(Date.now() + 45 * 86400000));
    const [courseRes, itemRes] = await Promise.all([
      fetch("/api/courses?minimal=1", { cache: "no-store" }),
      fetch(`/api/course-briefings?from=${from}&to=${to}`, { cache: "no-store" }),
    ]);
    setCourses(courseRes.ok ? await courseRes.json() : []);
    setItems(itemRes.ok ? await itemRes.json() : []);
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (courses.length === 0 || typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const courseId = Number(params.get("courseId"));
    const teacherId = Number(params.get("teacherId"));
    const targetDate = params.get("date")?.slice(0, 10) || "";
    if (!courseId || !courses.some((course) => course.id === courseId)) return;
    setForm((value) => ({ ...value, courseId, teacherId: teacherId || courses.find((course) => course.id === courseId)?.teacherId || 0, ...(targetDate ? { targetDate } : {}) }));
    setShowForm(true);
  }, [courses]);

  const selectedCourse = useMemo(() => courses.find((c) => c.id === form.courseId), [courses, form.courseId]);
  const courseOptions = useMemo(() => courses.map((course) => ({
    value: course.id,
    label: `${course.code}｜${course.school}｜${course.courseType}｜${course.time}`,
    searchText: `${course.code} ${course.school} ${course.courseType} ${course.time} ${course.teacher?.name ?? ""} ${course.assistantTeacher?.name ?? ""}`,
  })), [courses]);
  const teacherOptions = useMemo(() => {
    if (!selectedCourse) return [];
    return [
      selectedCourse.teacher,
      ...(selectedCourse.assistantTeacher ? [selectedCourse.assistantTeacher] : []),
    ].filter((value, index, array) => value && array.findIndex((teacher) => teacher.id === value.id) === index);
  }, [selectedCourse]);
  const teacherSearchOptions = useMemo(() => teacherOptions.map((teacher) => ({
    value: teacher.id,
    label: teacher.name,
    searchText: teacher.name,
  })), [teacherOptions]);

  function selectCourse(courseId: number) {
    const course = courses.find((item) => item.id === courseId);
    setForm((value) => ({ ...value, courseId, teacherId: course?.teacherId ?? 0 }));
  }

  async function save() {
    if (!form.courseId || !form.teacherId || !form.targetDate || !form.content.trim()) {
      showToast("error", "請選擇課程、老師、日期並填寫交辦內容");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/course-briefings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "建立交辦失敗");
      showToast(data.notified ? "success" : "error", data.notified ? "交辦已建立並通知老師" : `交辦已建立；LINE 未送出：${data.sendError}`);
      setForm(EMPTY);
      setShowForm(false);
      await load();
    } catch (error) {
      showToast("error", (error as Error).message || "建立交辦失敗");
    } finally {
      setSaving(false);
    }
  }

  async function update(id: number, body: object, message: string) {
    const res = await fetch(`/api/course-briefings/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return showToast("error", data.error || "操作失敗");
    showToast("success", message);
    await load();
  }

  const pending = items.filter((item) => item.status === "pending");
  const unacknowledged = pending.filter((item) => !item.ackAt);

  return (
    <main className="mx-auto max-w-7xl px-5 py-8 text-slate-900">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black">課前交辦</h1>
          <p className="mt-1 text-sm text-slate-500">可提前建立指定日期提醒；建立當下、前一天 15:00、當天 07:00 通知老師。</p>
        </div>
        <button onClick={() => setShowForm((value) => !value)} className="rounded-xl bg-blue-700 px-5 py-3 font-bold text-white">
          ＋ 新增課前交辦
        </button>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <Stat label="近期交辦" value={items.length} tone="blue" />
        <Stat label="待執行" value={pending.length} tone="amber" />
        <Stat label="老師未確認" value={unacknowledged.length} tone="rose" />
      </div>

      {showForm && (
        <section className="mt-6 rounded-3xl border border-blue-100 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold">新增交辦事項</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <label className="text-sm font-semibold">課程
              <SearchableSelect
                options={courseOptions}
                value={form.courseId || null}
                onChange={(value) => selectCourse(Number(value ?? 0))}
                allowEmpty={false}
                placeholder="搜尋課程編號、園所、課程或老師"
                emptyText="查無符合的課程，請確認關鍵字"
                className="mt-2"
              />
            </label>
            <label className="text-sm font-semibold">通知老師
              <SearchableSelect
                options={teacherSearchOptions}
                value={form.teacherId || null}
                onChange={(value) => setForm((current) => ({ ...current, teacherId: Number(value ?? 0) }))}
                allowEmpty={false}
                placeholder={selectedCourse ? "搜尋並選擇老師" : "請先選擇課程"}
                emptyText={selectedCourse ? "查無符合的老師" : "請先選擇課程"}
                className="mt-2"
              />
            </label>
            <label className="text-sm font-semibold">執行日期
              <input type="date" value={form.targetDate} onChange={(e) => setForm((value) => ({ ...value, targetDate: e.target.value }))} className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3" />
            </label>
            <label className="text-sm font-semibold">器材／附件說明（選填）
              <input value={form.equipmentNote} onChange={(e) => setForm((value) => ({ ...value, equipmentNote: e.target.value }))} placeholder="例如：標誌盤 10 個、大龍球" className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3" />
            </label>
          </div>
          <label className="mt-4 block text-sm font-semibold">當天要做的事項
            <textarea value={form.content} onChange={(e) => setForm((value) => ({ ...value, content: e.target.value }))} rows={4} placeholder="例如：進行親子成果活動，開課前先與園所老師確認動線。" className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 leading-7" />
          </label>
          <div className="mt-5 flex justify-end gap-3">
            <button onClick={() => setShowForm(false)} className="rounded-xl border px-5 py-3 font-semibold text-slate-600">取消</button>
            <button onClick={save} disabled={saving} className="rounded-xl bg-emerald-600 px-6 py-3 font-bold text-white disabled:opacity-60">{saving ? "建立中…" : "建立並通知老師"}</button>
          </div>
        </section>
      )}

      <section className="mt-6 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b bg-slate-50 px-6 py-4 font-bold">近期課程交辦</div>
        {items.length === 0 && <div className="p-10 text-center text-slate-400">目前沒有交辦事項</div>}
        <div className="divide-y">
          {items.map((item) => (
            <article key={item.id} className="p-5 md:flex md:items-start md:justify-between md:gap-5">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-black">{item.targetDate}</span>
                  <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700">{item.school}</span>
                  <span className="text-sm text-slate-500">{item.courseType}｜{item.courseTime}｜{item.teacherName}</span>
                </div>
                <p className="mt-3 whitespace-pre-line leading-7 text-slate-800">{item.content}</p>
                {item.equipmentNote && <p className="mt-2 text-sm font-semibold text-indigo-700">器材：{item.equipmentNote}</p>}
                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  <Badge ok={Boolean(item.immediateSentAt)} text={item.immediateSentAt ? "建立通知已送" : "建立通知未送"} />
                  <Badge ok={Boolean(item.ackAt)} text={item.ackAt ? "老師已確認" : "老師未確認"} />
                  {item.dayBeforeSentAt && <Badge ok text="前一天已提醒" />}
                  {item.sameDaySentAt && <Badge ok text="當天已提醒" />}
                  {item.status === "completed" && <Badge ok text="已完成" />}
                  {item.status === "cancelled" && <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-500">已取消</span>}
                </div>
              </div>
              <div className="mt-4 flex shrink-0 flex-wrap gap-2 md:mt-0">
                {item.status === "pending" && !item.ackAt && <button onClick={() => update(item.id, { action: "resend" }, "已再次提醒老師")} className="rounded-lg border border-blue-200 px-3 py-2 text-sm font-bold text-blue-700">再次提醒</button>}
                {item.status === "pending" && <button onClick={() => update(item.id, { status: "completed" }, "已標示完成")} className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700">標示完成</button>}
                {item.status === "pending" && <button onClick={() => update(item.id, { status: "cancelled" }, "已取消交辦")} className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-bold text-slate-600">取消</button>}
              </div>
            </article>
          ))}
        </div>
      </section>
      <Toast toast={toast} />
    </main>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: "blue" | "amber" | "rose" }) {
  const tones = { blue: "bg-blue-50 text-blue-700", amber: "bg-amber-50 text-amber-700", rose: "bg-rose-50 text-rose-700" };
  return <div className={`rounded-2xl p-5 ${tones[tone]}`}><div className="text-sm font-bold">{label}</div><div className="mt-2 text-3xl font-black">{value}</div></div>;
}

function Badge({ ok, text }: { ok: boolean; text: string }) {
  return <span className={`rounded-full px-2.5 py-1 ${ok ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{text}</span>;
}
