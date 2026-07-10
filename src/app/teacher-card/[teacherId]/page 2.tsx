"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

type Resume = {
  teacherName: string;
  photoUrl: string;
  education: string;
  experience: string;
  teachingStyle: string;
  specialties: string;
  intro: string;
  certifications: string;
};

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  if (!children || String(children).trim() === "") return null;
  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
      <div className="text-sm font-bold text-blue-700">{title}</div>
      <div className="mt-3 whitespace-pre-line text-base leading-8 text-slate-700">{children}</div>
    </section>
  );
}

export default function TeacherCardPage() {
  const params = useParams<{ teacherId: string }>();
  const [resume, setResume] = useState<Resume | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/teacher-resumes/card/${encodeURIComponent(params.teacherId)}`, { cache: "no-store" })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "找不到老師簡歷");
        return data as Resume;
      })
      .then(setResume)
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, [params.teacherId]);

  if (loading) return <main className="mx-auto max-w-3xl px-5 py-16 text-center text-slate-500">載入中...</main>;
  if (!resume) return <main className="mx-auto max-w-3xl px-5 py-16 text-center text-red-600">{error || "找不到老師簡歷"}</main>;

  return (
    <main className="min-h-screen bg-slate-50 px-5 py-8 text-slate-900">
      <div className="mx-auto max-w-3xl space-y-5">
        <section className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-slate-100">
          <div className="bg-blue-700 px-6 py-5 text-white">
            <div className="text-sm font-semibold text-blue-100">WaysLeader AI 師資簡歷</div>
            <h1 className="mt-2 text-3xl font-bold">{resume.teacherName} 老師</h1>
          </div>
          <div className="grid gap-5 p-6 md:grid-cols-[180px_1fr]">
            <div className="h-48 overflow-hidden rounded-2xl bg-slate-100 md:h-56">
              {resume.photoUrl ? <img src={resume.photoUrl} alt={resume.teacherName} className="h-full w-full object-cover" /> : null}
            </div>
            <div className="space-y-4">
              <div>
                <div className="text-sm font-bold text-blue-700">專長</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(resume.specialties || "幼兒教學").split(/[、,，\n]/).map((item) => item.trim()).filter(Boolean).map((item) => (
                    <span key={item} className="rounded-full bg-blue-50 px-3 py-1 text-sm font-semibold text-blue-700">{item}</span>
                  ))}
                </div>
              </div>
              {resume.intro && <p className="whitespace-pre-line text-base leading-8 text-slate-700">{resume.intro}</p>}
            </div>
          </div>
        </section>

        <Block title="學歷">{resume.education}</Block>
        <Block title="教學 / 工作經歷">{resume.experience}</Block>
        <Block title="教學風格">{resume.teachingStyle}</Block>
        <Block title="證照 / 研習">{resume.certifications}</Block>
      </div>
    </main>
  );
}
