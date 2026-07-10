"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

type Context = {
  teacher: { id: number; name: string };
  resume: {
    photoUrl: string;
    education: string;
    experience: string;
    teachingStyle: string;
    specialties: string;
    intro: string;
    certifications: string;
  } | null;
};

const empty = {
  photoUrl: "",
  education: "",
  experience: "",
  teachingStyle: "",
  specialties: "",
  intro: "",
  certifications: "",
};

export default function TeacherResumeFormPage() {
  const params = useParams<{ token: string }>();
  const [context, setContext] = useState<Context | null>(null);
  const [form, setForm] = useState(empty);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/teacher-resumes/public/${encodeURIComponent(params.token)}`, { cache: "no-store" })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "簡歷填寫連結無效");
        return data as Context;
      })
      .then((data) => {
        setContext(data);
        setForm({ ...empty, ...(data.resume ?? {}) });
      })
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, [params.token]);

  async function uploadPhoto(file: File) {
    setUploading(true);
    setError("");
    try {
      const fd = new FormData();
      fd.append("photo", file);
      const res = await fetch(`/api/teacher-resumes/public/${encodeURIComponent(params.token)}/photo`, { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "照片上傳失敗");
      setForm((current) => ({ ...current, photoUrl: data.url }));
    } catch (err) {
      setError((err as Error).message || "照片上傳失敗");
    } finally {
      setUploading(false);
    }
  }

  async function submit() {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/teacher-resumes/public/${encodeURIComponent(params.token)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "簡歷資料送出失敗");
      setDone(true);
    } catch (err) {
      setError((err as Error).message || "簡歷資料送出失敗");
    } finally {
      setSaving(false);
    }
  }

  const input = "mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-base outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100";
  const label = "block text-sm font-semibold text-slate-700";

  if (loading) return <main className="mx-auto max-w-md px-5 py-16 text-center text-slate-500">載入中...</main>;
  if (!context) return <main className="mx-auto max-w-md px-5 py-16 text-center text-red-600">{error || "簡歷填寫連結無效"}</main>;

  return (
    <main className="mx-auto max-w-2xl px-5 py-8 text-slate-800">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="text-sm font-semibold text-blue-700">WaysLeader AI 老師簡歷</div>
        <h1 className="mt-2 text-2xl font-bold text-slate-900">{context.teacher.name} 老師</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">請協助填寫照片、學歷、教學經歷與教學風格，公司會整理成公版簡歷提供園所參考。</p>
      </section>

      {done ? (
        <section className="mt-4 rounded-2xl border border-green-100 bg-green-50 p-5 text-green-700">
          <div className="font-bold">已送出老師簡歷資料</div>
          <p className="mt-2 text-sm">謝謝老師協助，行政會再整理成正式簡歷。</p>
        </section>
      ) : (
        <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          {error && <div className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-600">{error}</div>}

          <label className={label}>
            老師照片
            <div className="mt-2 flex items-center gap-4">
              <div className="h-24 w-24 overflow-hidden rounded-2xl bg-slate-100">
                {form.photoUrl ? <img src={form.photoUrl} alt="老師照片" className="h-full w-full object-cover" /> : null}
              </div>
              <div>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void uploadPhoto(file);
                  }}
                  className="block text-sm text-slate-500"
                />
                <div className="mt-2 text-xs text-slate-400">{uploading ? "照片上傳中..." : "建議使用清楚半身照，檔案小於 2MB。"}</div>
              </div>
            </div>
          </label>

          <label className={`${label} mt-5`}>
            專長
            <input value={form.specialties} onChange={(e) => setForm({ ...form, specialties: e.target.value })} className={input} placeholder="例如：幼兒體能、足球、舞蹈、律動" />
          </label>
          <label className={`${label} mt-5`}>
            學歷
            <textarea value={form.education} onChange={(e) => setForm({ ...form, education: e.target.value })} className={`${input} min-h-24`} placeholder="例如：國立體育大學 運動保健學系" />
          </label>
          <label className={`${label} mt-5`}>
            教學 / 工作經歷
            <textarea value={form.experience} onChange={(e) => setForm({ ...form, experience: e.target.value })} className={`${input} min-h-28`} placeholder="例如：幼兒足球教練 3 年、安親班體能課、幼兒園律動課" />
          </label>
          <label className={`${label} mt-5`}>
            教學風格
            <textarea value={form.teachingStyle} onChange={(e) => setForm({ ...form, teachingStyle: e.target.value })} className={`${input} min-h-28`} placeholder="例如：活潑互動、重視秩序與安全、擅長用遊戲引導孩子學習" />
          </label>
          <label className={`${label} mt-5`}>
            自我介紹
            <textarea value={form.intro} onChange={(e) => setForm({ ...form, intro: e.target.value })} className={`${input} min-h-28`} placeholder="簡短介紹自己，讓園所更快認識您" />
          </label>
          <label className={`${label} mt-5`}>
            證照 / 研習
            <textarea value={form.certifications} onChange={(e) => setForm({ ...form, certifications: e.target.value })} className={`${input} min-h-24`} placeholder="可填教練證、急救證照、相關研習等" />
          </label>

          <button onClick={submit} disabled={saving || uploading} className="mt-6 w-full rounded-xl bg-blue-600 px-4 py-3 text-base font-bold text-white disabled:opacity-60">
            {saving ? "送出中..." : "送出老師簡歷"}
          </button>
        </section>
      )}
    </main>
  );
}
