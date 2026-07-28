"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

type Detail = {
  teacherName: string; targetDate: string; school: string; courseType: string;
  courseTime: string; content: string; equipmentNote: string; acknowledged: boolean;
};

export default function CourseBriefingAckPage() {
  const { token } = useParams<{ token: string }>();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`/api/course-briefing-ack/${encodeURIComponent(token)}`, { cache: "no-store" })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "連結無效");
        setDetail(data);
      })
      .catch((err) => setError((err as Error).message));
  }, [token]);

  async function acknowledge() {
    setSaving(true);
    const res = await fetch(`/api/course-briefing-ack/${encodeURIComponent(token)}`, { method: "POST" });
    if (res.ok) setDetail((value) => value ? { ...value, acknowledged: true } : value);
    else setError((await res.json().catch(() => ({}))).error || "確認失敗");
    setSaving(false);
  }

  return (
    <main className="min-h-screen bg-slate-50 px-5 py-10 text-slate-900">
      <div className="mx-auto max-w-lg">
        <div className="rounded-3xl bg-blue-700 p-7 text-white shadow-lg">
          <div className="text-sm font-bold text-blue-100">課前交辦</div>
          <h1 className="mt-2 text-2xl font-black">課程提醒確認</h1>
          <p className="mt-2 text-sm text-blue-100">請確認已閱讀本次課程注意事項。</p>
        </div>
        <section className="mt-5 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          {error && <p className="text-center text-red-600">{error}</p>}
          {!detail && !error && <p className="text-center text-slate-500">載入中…</p>}
          {detail && (
            <>
              <div className="space-y-1 text-sm text-slate-600">
                <p className="text-lg font-bold text-slate-900">{detail.teacherName} 老師</p>
                <p>{detail.targetDate}｜{detail.courseTime}</p>
                <p>{detail.school}｜{detail.courseType}</p>
              </div>
              <div className="mt-5 rounded-2xl bg-amber-50 p-5 leading-7 text-slate-800">{detail.content}</div>
              {detail.equipmentNote && (
                <div className="mt-3 rounded-2xl bg-blue-50 p-4 text-sm text-blue-800">器材：{detail.equipmentNote}</div>
              )}
              {detail.acknowledged ? (
                <div className="mt-6 rounded-2xl bg-emerald-50 py-4 text-center font-bold text-emerald-700">✅ 已確認收到</div>
              ) : (
                <button onClick={acknowledge} disabled={saving} className="mt-6 w-full rounded-2xl bg-emerald-600 py-4 font-bold text-white disabled:opacity-60">
                  {saving ? "確認中…" : "✅ 我已閱讀並確認收到"}
                </button>
              )}
            </>
          )}
        </section>
      </div>
    </main>
  );
}
