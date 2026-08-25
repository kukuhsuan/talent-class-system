"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

type Snapshot = {
  schoolName: string;
  year: number;
  months: number[];
  classCount: number;
  totalStudentCount: number;
  lessons: Array<{ attendanceId: number | null; courseName: string; date: string; weekday: string; time: string; studentCount: number | null }>;
};

type Context = {
  snapshot: Snapshot;
  snapshotHash: string;
  status: string;
  confirmerName: string;
  confirmerNote: string;
  confirmedAt: string | null;
};

function dateLabel(value: string) {
  const [, month, day] = value.slice(0, 10).split("-").map(Number);
  return `${month}/${day}`;
}

export default function SchoolAttendanceVerificationPage() {
  const params = useParams<{ token: string }>();
  const token = encodeURIComponent(params.token);
  const [context, setContext] = useState<Context | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [note, setNote] = useState("");

  const grouped = useMemo(() => {
    const groups = new Map<string, Snapshot["lessons"]>();
    for (const lesson of context?.snapshot.lessons ?? []) {
      const rows = groups.get(lesson.courseName) ?? [];
      rows.push(lesson);
      groups.set(lesson.courseName, rows);
    }
    return [...groups.entries()];
  }, [context]);

  useEffect(() => {
    fetch(`/api/school-attendance-verification/${token}`, { cache: "no-store" })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "核對連結無效");
        return data as Context;
      })
      .then((data) => {
        setContext(data);
        setName(data.confirmerName || "");
        setNote(data.confirmerNote || "");
      })
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, [token]);

  async function submit(action: "confirm" | "issue") {
    if (!context || saving) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/school-attendance-verification/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, confirmerName: name, note, snapshotHash: context.snapshotHash }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "送出失敗");
      setContext({ ...context, status: data.status, confirmerName: data.confirmerName, confirmerNote: data.note, confirmedAt: data.confirmedAt });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <main className="min-h-screen bg-slate-50 p-6 text-center text-slate-500">正在整理課程人數…</main>;
  if (!context) return <main className="min-h-screen bg-slate-50 p-6"><div className="mx-auto max-w-xl rounded-2xl bg-white p-6 text-center font-semibold text-red-600 shadow-sm">{error || "核對連結無效"}</div></main>;

  const done = context.status === "confirmed";
  const issue = context.status === "issue";
  const stale = context.status === "stale";

  return (
    <main className="min-h-screen bg-[#f4f8ff] px-4 py-6 text-slate-800 md:py-10">
      <div className="mx-auto max-w-3xl space-y-5">
        <header className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-blue-100">
          <div className="bg-blue-700 px-6 py-5 text-white">
            <div className="text-sm font-semibold text-blue-100">運動班長｜園所核對</div>
            <h1 className="mt-1 text-2xl font-black">暑期課程人數核對</h1>
          </div>
          <div className="p-6">
            <div className="text-xl font-bold">{context.snapshot.schoolName}</div>
            <div className="mt-1 text-sm text-slate-500">{context.snapshot.year} 年 {context.snapshot.months.join("、")} 月</div>
            <p className="mt-4 rounded-xl bg-blue-50 p-4 text-sm leading-6 text-blue-900">請協助核對下列上課人數。若無誤請按「確認人數無誤」；若有差異，請留下正確人數或說明。</p>
          </div>
        </header>

        {(done || issue || stale) && (
          <div className={`rounded-2xl border p-4 font-semibold ${done ? "border-emerald-200 bg-emerald-50 text-emerald-800" : issue ? "border-amber-200 bg-amber-50 text-amber-800" : "border-red-200 bg-red-50 text-red-700"}`}>
            {done ? `已由 ${context.confirmerName} 確認人數無誤。` : issue ? `已收到 ${context.confirmerName} 回報的人數問題，客服會進行修正。` : "確認後資料曾被修改，請重新核對並再次確認。"}
          </div>
        )}

        <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-blue-100 md:p-6">
          <div className="mb-5 grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-slate-50 p-4"><div className="text-xs font-semibold text-slate-500">課程堂數</div><div className="mt-1 text-2xl font-black">{context.snapshot.classCount} 堂</div></div>
            <div className="rounded-2xl bg-blue-50 p-4"><div className="text-xs font-semibold text-blue-600">合計人次</div><div className="mt-1 text-2xl font-black text-blue-700">{context.snapshot.totalStudentCount} 人次</div></div>
          </div>
          <div className="space-y-5">
            {grouped.map(([courseName, lessons]) => (
              <div key={courseName}>
                <h2 className="mb-2 text-lg font-bold text-slate-900">{courseName}</h2>
                <div className="overflow-hidden rounded-2xl border border-slate-200">
                  {lessons.map((lesson) => (
                    <div key={lesson.attendanceId ?? `${lesson.date}-${lesson.time}`} className="grid grid-cols-[1fr_auto] gap-4 border-b border-slate-100 px-4 py-3 last:border-0">
                      <div><div className="font-semibold">{dateLabel(lesson.date)}（{lesson.weekday}）</div><div className="mt-1 text-sm text-slate-500">{lesson.time || "時間未填"}</div></div>
                      <div className={`self-center rounded-xl px-4 py-2 text-lg font-black ${lesson.studentCount == null ? "bg-amber-50 text-amber-700" : "bg-blue-50 text-blue-700"}`}>{lesson.studentCount == null ? "未填" : `${lesson.studentCount} 人`}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-blue-100 md:p-6">
          <label className="block text-sm font-bold text-slate-700">確認人姓名／職稱</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-blue-500" placeholder="例如：王老師、陳主任" />
          <label className="mt-4 block text-sm font-bold text-slate-700">補充說明（人數有誤時必填）</label>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} className="mt-2 min-h-28 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-blue-500" placeholder="例如：8/14 足球應為 22 人" />
          {error && <div className="mt-3 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-600">{error}</div>}
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <button onClick={() => submit("issue")} disabled={saving} className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 font-bold text-amber-800 disabled:opacity-50">回報人數有誤</button>
            <button onClick={() => submit("confirm")} disabled={saving} className="rounded-xl bg-emerald-600 px-4 py-3 font-bold text-white disabled:opacity-50">{saving ? "送出中…" : "確認人數無誤"}</button>
          </div>
        </section>
      </div>
    </main>
  );
}
