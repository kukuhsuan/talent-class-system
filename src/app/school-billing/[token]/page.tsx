"use client";

import { use, useEffect, useState } from "react";

type Profile = {
  schoolName: string;
  officialName: string;
  invoiceTitle: string;
  taxId: string;
  billingEmail: string;
  submittedAt: string | null;
};

export default function SchoolBillingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [form, setForm] = useState({ officialName: "", invoiceTitle: "", taxId: "", billingEmail: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/school-billing/${encodeURIComponent(token)}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "連結載入失敗");
        setProfile(data);
        setForm({ officialName: data.officialName || data.schoolName || "", invoiceTitle: data.invoiceTitle || "", taxId: data.taxId || "", billingEmail: data.billingEmail || "" });
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [token]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true); setError("");
    try {
      const res = await fetch(`/api/school-billing/${encodeURIComponent(token)}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "送出失敗，請稍後再試");
      setDone(true);
    } catch (e) { setError((e as Error).message); } finally { setSaving(false); }
  }

  return (
    <main className="min-h-screen bg-[#F7F5F1] px-4 py-8 text-slate-800 sm:py-14">
      <div className="mx-auto max-w-xl">
        <div className="mb-5 rounded-3xl border border-[#E6DED2] bg-white px-6 py-7 shadow-sm">
          <div className="text-xs font-bold tracking-[0.16em] text-[#9A7B59]">園所資料確認</div>
          <h1 className="mt-3 text-2xl font-black text-[#44372C]">新合作園所資料填寫</h1>
          <p className="mt-2 text-sm leading-6 text-[#7D6D5E]">請協助填寫後續請款與發票所需資料，約 1 分鐘即可完成。</p>
        </div>
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          {loading ? <div className="py-14 text-center text-slate-400">資料載入中…</div> : error && !profile ? <div className="py-14 text-center font-bold text-rose-600">{error}</div> : done ? (
            <div className="py-12 text-center">
              <div className="text-5xl">✅</div>
              <h2 className="mt-4 text-xl font-black text-emerald-700">資料已成功送出</h2>
              <p className="mt-2 text-sm text-slate-500">客服已收到通知，謝謝您的協助。</p>
              <button onClick={() => setDone(false)} className="mt-6 text-sm font-bold text-blue-700 underline">需要修改資料</button>
            </div>
          ) : profile ? (
            <form onSubmit={submit} className="space-y-5">
              <div className="rounded-2xl bg-[#F5EFE7] px-4 py-3 text-sm text-[#6E543B]"><span className="font-bold">園所：</span>{profile.schoolName}</div>
              <Field label="園所正式名稱" value={form.officialName} onChange={(officialName) => setForm({ ...form, officialName })} />
              <Field label="請款／發票抬頭" value={form.invoiceTitle} onChange={(invoiceTitle) => setForm({ ...form, invoiceTitle })} />
              <Field label="統一編號" value={form.taxId} inputMode="numeric" maxLength={8} onChange={(taxId) => setForm({ ...form, taxId: taxId.replace(/\D/g, "").slice(0, 8) })} placeholder="8 位數字" />
              <Field label="收件信箱" value={form.billingEmail} inputMode="email" onChange={(billingEmail) => setForm({ ...form, billingEmail })} placeholder="example@school.com" />
              {error && <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">{error}</div>}
              <button disabled={saving} className="w-full rounded-2xl bg-emerald-600 px-5 py-4 font-black text-white shadow-lg shadow-emerald-100 transition hover:bg-emerald-700 disabled:opacity-50">{saving ? "送出中…" : "確認並送出資料"}</button>
              <p className="text-center text-xs leading-5 text-slate-400">資料僅供合作建檔、請款與發票寄送使用。</p>
            </form>
          ) : null}
        </section>
      </div>
    </main>
  );
}

function Field({ label, value, onChange, placeholder, inputMode = "text", maxLength }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"]; maxLength?: number }) {
  return <label className="block"><span className="mb-2 block text-sm font-bold text-slate-700">{label} <span className="text-rose-500">*</span></span><input required value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} inputMode={inputMode} maxLength={maxLength} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-base outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-50" /></label>;
}
