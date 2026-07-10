"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

type Context = {
  campaign: {
    title: string;
    regions: string;
    courses: string;
    timeSlots: string;
    description: string;
  };
  teacher: { name: string };
};

export default function RecruitmentReferralPage() {
  const params = useParams<{ token: string }>();
  const [context, setContext] = useState<Context | null>(null);
  const [form, setForm] = useState({ candidateName: "", candidatePhone: "", notes: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/recruitment/public/${encodeURIComponent(params.token)}`, { cache: "no-store" })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "推薦連結無效");
        return data;
      })
      .then(setContext)
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, [params.token]);

  async function submit() {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/recruitment/public/${encodeURIComponent(params.token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "推薦送出失敗");
      setDone(true);
    } catch (err) {
      setError((err as Error).message || "推薦送出失敗");
    } finally {
      setSaving(false);
    }
  }

  const input = "mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-base outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100";

  if (loading) return <main className="mx-auto max-w-md px-5 py-16 text-center text-slate-500">載入中...</main>;
  if (!context) return <main className="mx-auto max-w-md px-5 py-16 text-center text-red-600">{error || "推薦連結無效"}</main>;

  return (
    <main className="mx-auto max-w-md px-5 py-8 text-slate-800">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="text-sm font-semibold text-blue-700">WaysLeader AI 全民招募</div>
        <h1 className="mt-2 text-2xl font-bold text-slate-900">{context.campaign.title}</h1>
        <div className="mt-4 rounded-xl bg-blue-50 p-4 text-sm leading-6 text-slate-700">
          <div>需求地區：{context.campaign.regions || "未指定"}</div>
          <div>需求課程：{context.campaign.courses || "未指定"}</div>
          <div>需求時段：{context.campaign.timeSlots || "未指定"}</div>
          {context.campaign.description && <div className="mt-2 whitespace-pre-line">說明：{context.campaign.description}</div>}
        </div>
        <div className="mt-3 text-sm text-slate-500">推薦人：{context.teacher.name}</div>
      </section>

      {done ? (
        <section className="mt-4 rounded-2xl border border-green-100 bg-green-50 p-5 text-green-700">
          <div className="font-bold">已送出推薦資料</div>
          <p className="mt-2 text-sm">謝謝老師協助，公司會再主動聯絡被推薦人。</p>
        </section>
      ) : (
        <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          {error && <div className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-600">{error}</div>}
          <label className="block text-sm font-semibold text-slate-700">
            被推薦老師姓名
            <input value={form.candidateName} onChange={(e) => setForm({ ...form, candidateName: e.target.value })} className={input} placeholder="請輸入姓名" />
          </label>
          <label className="mt-4 block text-sm font-semibold text-slate-700">
            被推薦老師電話
            <input value={form.candidatePhone} onChange={(e) => setForm({ ...form, candidatePhone: e.target.value })} className={input} placeholder="請輸入電話" inputMode="tel" />
          </label>
          <label className="mt-4 block text-sm font-semibold text-slate-700">
            備註
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className={`${input} min-h-24`} placeholder="可補充專長、地區、可上課時間" />
          </label>
          <button
            onClick={submit}
            disabled={saving}
            className="mt-5 w-full rounded-xl bg-blue-600 px-4 py-3 text-base font-bold text-white disabled:opacity-60"
          >
            {saving ? "送出中..." : "送出推薦"}
          </button>
        </section>
      )}
    </main>
  );
}
