"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

type ShareData = {
  date: string;
  school: string;
  courseName: string;
  teacherName: string;
  reportContent: string;
  summary: string;
  skillFocus: string;
  classStatus: string;
  photoUrls: string[];
};

function displayText(data: ShareData) {
  const content = data.reportContent.trim();
  const outcome = content.match(/成果回報[：:]\s*([\s\S]*?)(?=\n[^：:\n]{2,8}[：:]|$)/)?.[1]?.trim();
  return outcome || data.summary || content || "本堂課已完成學習成果回報。";
}

function skillsOf(value: string) {
  const raw = String(value ?? "").trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
  } catch { /* 相容舊資料 */ }
  return raw.split(/[、,，\n]/).map((item) => item.trim()).filter(Boolean);
}

export default function LearningSharePage() {
  const params = useParams<{ token: string }>();
  const [data, setData] = useState<ShareData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/learning-share/${encodeURIComponent(params.token)}`, { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "讀取失敗");
        setData(body);
      })
      .catch((reason) => setError((reason as Error).message));
  }, [params.token]);

  if (error) return <main className="grid min-h-screen place-items-center bg-[#F7FAFF] p-6"><div className="rounded-3xl bg-white p-8 text-center shadow-sm"><h1 className="text-xl font-black text-slate-800">無法開啟成果</h1><p className="mt-3 text-slate-500">{error}</p></div></main>;
  if (!data) return <main className="grid min-h-screen place-items-center bg-[#F7FAFF] text-slate-500">學習成果載入中…</main>;

  const skills = skillsOf(data.skillFocus);
  return (
    <main className="min-h-screen bg-[#F7FAFF] px-4 py-8 text-slate-800 sm:py-12">
      <article className="mx-auto max-w-2xl overflow-hidden rounded-[28px] bg-white shadow-[0_18px_55px_rgba(49,94,159,0.12)]">
        <header className="bg-[#315E9F] px-6 py-8 text-white sm:px-10">
          <p className="text-sm font-bold text-blue-100">WaysLeader AI｜學習成果</p>
          <h1 className="mt-2 text-3xl font-black">{data.courseName}</h1>
          <p className="mt-3 text-sm text-blue-100">{data.school}｜{data.date}</p>
        </header>
        <div className="space-y-6 p-6 sm:p-10">
          <section>
            <p className="text-xs font-bold tracking-wider text-[#315E9F]">今日課堂紀錄</p>
            <p className="mt-3 whitespace-pre-wrap text-base leading-8 text-slate-700">{displayText(data)}</p>
          </section>
          {skills.length > 0 && <section><p className="text-sm font-black">能力培養</p><div className="mt-3 flex flex-wrap gap-2">{skills.map((skill) => <span key={skill} className="rounded-full bg-blue-50 px-4 py-2 text-sm font-bold text-[#315E9F]">{skill}</span>)}</div></section>}
          {data.photoUrls.length > 0 && <section><p className="text-sm font-black">課堂活動照片</p><div className={`mt-3 grid gap-3 ${data.photoUrls.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>{data.photoUrls.map((url) => <img key={url} src={url} alt="課堂活動" className="h-56 w-full rounded-2xl object-cover" />)}</div></section>}
          <footer className="border-t pt-5 text-sm text-slate-500">授課老師：{data.teacherName}</footer>
        </div>
      </article>
    </main>
  );
}
