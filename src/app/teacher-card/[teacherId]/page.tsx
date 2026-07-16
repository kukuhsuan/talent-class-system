"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";

// 動態載入 html-to-image（支援 Tailwind v4 的 lab/oklch 色彩；僅在下載時載入）
type HtmlToImage = { toPng: (el: HTMLElement, opts?: Record<string, unknown>) => Promise<string> };
let htmlToImagePromise: Promise<HtmlToImage> | null = null;
function loadHtmlToImage() {
  if (!htmlToImagePromise) {
    htmlToImagePromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://cdnjs.cloudflare.com/ajax/libs/html-to-image/1.11.11/html-to-image.js";
      script.onload = () => {
        const lib = (window as unknown as { htmlToImage?: HtmlToImage }).htmlToImage;
        if (lib) resolve(lib);
        else reject(new Error("圖檔工具載入失敗"));
      };
      script.onerror = () => reject(new Error("圖檔工具載入失敗，請檢查網路後再試"));
      document.head.appendChild(script);
    });
  }
  return htmlToImagePromise;
}

type TeachingProfile = {
  primaryRegionLabel: string;
  primarySpecialtyLabel: string;
  recentAttendanceCount: number;
  primaryCourseTypes: string[];
  hasTeachingRecords: boolean;
};

type Resume = {
  teacherName: string;
  photoUrl: string;
  education: string;
  experience: string;
  teachingStyle: string;
  specialties: string;
  intro: string;
  certifications: string;
  teachingProfile?: TeachingProfile | null;
};

function splitItems(value: string) {
  return value
    .split(/\n|、|，|,|；|;/)
    .map((item) => item.replace(/^[-•●\s]+/, "").trim())
    .filter(Boolean);
}

function firstLine(value: string) {
  return value.split(/\n/).map((item) => item.trim()).find(Boolean) ?? "";
}

function initials(name: string) {
  return name.trim().slice(0, 1) || "師";
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white/90 px-4 py-3 shadow-sm ring-1 ring-blue-100">
      <div className="text-xs font-semibold text-slate-400">{label}</div>
      <div className="mt-1 text-base font-bold text-slate-900">{value}</div>
    </div>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-bold text-slate-900">{title}</h2>
        {subtitle && <div className="text-xs font-semibold text-blue-600">{subtitle}</div>}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function BulletList({ value, empty }: { value: string; empty: string }) {
  const items = splitItems(value);
  if (items.length === 0) return <p className="text-sm leading-7 text-slate-500">{empty}</p>;
  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li key={item} className="flex gap-2 text-sm leading-7 text-slate-700">
          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function Feature({ title, body, tone }: { title: string; body: string; tone: "rose" | "emerald" | "amber" }) {
  const tones = {
    rose: "bg-rose-50 text-rose-700 ring-rose-100",
    emerald: "bg-emerald-50 text-emerald-700 ring-emerald-100",
    amber: "bg-amber-50 text-amber-700 ring-amber-100",
  };
  return (
    <div className={`rounded-2xl p-4 ring-1 ${tones[tone]}`}>
      <div className="text-base font-bold">{title}</div>
      <p className="mt-2 text-sm leading-6 text-slate-600">{body}</p>
    </div>
  );
}

export default function TeacherCardPage() {
  const params = useParams<{ teacherId: string }>();
  const [resume, setResume] = useState<Resume | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState("");
  const cardRef = useRef<HTMLDivElement>(null);

  async function downloadImage() {
    if (downloading || !cardRef.current || !resume) return;
    setDownloading(true);
    setDownloadError("");
    try {
      const htmlToImage = await loadHtmlToImage();
      const dataUrl = await htmlToImage.toPng(cardRef.current, {
        pixelRatio: 2,
        backgroundColor: "#f3f7ff",
        cacheBust: true,
      });
      const link = document.createElement("a");
      link.download = `${resume.teacherName}老師簡歷.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      setDownloadError((err as Error).message || "圖檔產生失敗，請再試一次");
    } finally {
      setDownloading(false);
    }
  }

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

  const derived = useMemo(() => {
    if (!resume) return null;
    const profile = resume.teachingProfile;
    const specialtyItems = [
      ...splitItems(resume.specialties),
      ...(profile?.primaryCourseTypes ?? []),
    ].filter((item, index, arr) => item && arr.indexOf(item) === index).slice(0, 8);
    const experienceItems = splitItems(resume.experience);
    const educationTitle = firstLine(resume.education);
    const tagline = resume.intro
      ? firstLine(resume.intro)
      : `${resume.teacherName}老師擅長以穩定、親切的方式陪伴孩子學習。`;
    return {
      profile,
      specialtyItems,
      experienceItems,
      educationTitle,
      tagline,
      region: profile?.primaryRegionLabel || "可配合區域洽詢",
      specialtyLabel: profile?.primarySpecialtyLabel || (specialtyItems.length ? `專長：${specialtyItems[0]}` : "專長整理中"),
      classCount: profile?.hasTeachingRecords ? `${profile.recentAttendanceCount} 堂` : "整理中",
    };
  }, [resume]);

  if (loading) return <main className="mx-auto max-w-3xl px-5 py-16 text-center text-slate-500">載入中...</main>;
  if (!resume || !derived) return <main className="mx-auto max-w-3xl px-5 py-16 text-center text-red-600">{error || "找不到老師簡歷"}</main>;

  return (
    <main className="min-h-screen bg-[#f3f7ff] px-4 py-6 text-slate-900 md:px-6 md:py-10">
      <div className="mx-auto max-w-4xl">
        <div className="mb-4 flex items-center justify-end gap-3">
          {downloadError && <span className="text-sm text-red-600">{downloadError}</span>}
          <button
            onClick={downloadImage}
            disabled={downloading}
            className="rounded-full bg-blue-700 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-blue-800 disabled:opacity-60"
          >
            {downloading ? "圖檔產生中..." : "下載簡歷圖檔"}
          </button>
        </div>
        <div ref={cardRef} className="bg-[#f3f7ff] p-1">
        <section className="overflow-hidden rounded-[32px] bg-white shadow-sm ring-1 ring-blue-100">
          <div className="relative bg-gradient-to-br from-blue-700 via-blue-700 to-indigo-800 px-6 pb-20 pt-7 text-white md:px-8">
            <div className="absolute right-8 top-8 h-28 w-28 rounded-full bg-white/10" />
            <div className="absolute right-24 top-24 h-10 w-10 rounded-full bg-white/10" />
            <div className="absolute -left-6 bottom-2 h-20 w-20 rounded-full bg-white/5" />
            <div className="relative">
              <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-bold tracking-wide text-blue-50">
                WaysLeader AI 師資簡歷
              </div>
              <h1 className="mt-4 text-4xl font-black tracking-normal md:text-5xl">{resume.teacherName} 老師</h1>
              <p className="mt-3 max-w-2xl text-base font-medium leading-7 text-blue-50">{derived.tagline}</p>
            </div>
          </div>

          <div className="-mt-14 grid gap-5 px-5 pb-6 md:grid-cols-[240px_1fr] md:px-8">
            <div className="relative">
              <div className="mx-auto h-52 w-52 overflow-hidden rounded-full border-8 border-white bg-blue-50 shadow-sm md:mx-0">
                {resume.photoUrl
                  ? <img src={resume.photoUrl} alt={resume.teacherName} crossOrigin="anonymous" className="h-full w-full object-cover" />
                  : <div className="flex h-full w-full items-center justify-center text-6xl font-black text-blue-200">{initials(resume.teacherName)}</div>}
              </div>
              <div className="mt-4 grid gap-2 text-center">
                <Stat label="主要區域" value={derived.region} />
              </div>
            </div>

            <div className="rounded-[28px] bg-white p-4 shadow-sm ring-1 ring-slate-100 md:p-5">
              <div className="text-lg font-bold text-blue-700">{derived.specialtyLabel}</div>
              <div className="mt-3 flex flex-wrap gap-2">
                {(derived.specialtyItems.length ? derived.specialtyItems : ["幼兒教學", "互動引導"]).map((item) => (
                  <span key={item} className="rounded-full bg-blue-50 px-3 py-1.5 text-sm font-bold text-blue-700">{item}</span>
                ))}
              </div>
              {resume.intro && <p className="mt-5 whitespace-pre-line text-base leading-8 text-slate-700">{resume.intro}</p>}
              <div className="mt-5 grid gap-3 md:grid-cols-3">
                <Stat label="學歷摘要" value={derived.educationTitle || "已提供"} />
                <Stat label="教學經歷" value={derived.experienceItems.length ? `${derived.experienceItems.length} 項` : "已提供"} />
                <Stat label="資料狀態" value="已完成" />
              </div>
            </div>
          </div>
        </section>

        <div className="mt-5 grid gap-5 md:grid-cols-3">
          <Section title="專長領域">
            <BulletList value={resume.specialties} empty="專長資料整理中。" />
          </Section>
          <Section title="學歷">
            <BulletList value={resume.education} empty="學歷資料整理中。" />
          </Section>
          <Section title="教學 / 工作經歷">
            <BulletList value={resume.experience} empty="教學經歷整理中。" />
          </Section>
        </div>

        <div className="mt-5 grid gap-5 md:grid-cols-[1fr_1.35fr]">
          <Section title="證照 / 專業資格" subtitle="Professional">
            <BulletList value={resume.certifications} empty="證照與研習資料整理中。" />
          </Section>
          <Section title="教學特色" subtitle="Teaching Style">
            <div className="grid gap-3 md:grid-cols-3">
              <Feature
                title="安全陪伴"
                body="重視課堂秩序與孩子安全，讓孩子在穩定節奏中放心參與。"
                tone="rose"
              />
              <Feature
                title="互動引導"
                body="透過遊戲化教學與正向鼓勵，提高孩子的參與感與成就感。"
                tone="emerald"
              />
              <Feature
                title="能力培養"
                body="依孩子狀態調整活動難度，逐步建立協調、專注與自信。"
                tone="amber"
              />
            </div>
            {resume.teachingStyle && (
              <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm leading-7 text-slate-700">
                <div className="mb-2 font-bold text-slate-900">老師自述</div>
                <div className="whitespace-pre-line">{resume.teachingStyle}</div>
              </div>
            )}
          </Section>
        </div>

        <div className="mt-5 flex items-center justify-between gap-4 rounded-3xl bg-gradient-to-r from-blue-700 to-indigo-800 px-6 py-5 text-white shadow-sm">
          <div>
            <div className="text-sm font-semibold text-blue-100">WaysLeader AI 幼兒園學習成果平台</div>
            <div className="mt-1 text-xl font-bold">專業師資，安心陪伴孩子成長</div>
          </div>
          <div className="hidden text-right text-xs font-semibold leading-5 text-blue-100 md:block">
            師資均經公司審核培訓<br />課程與教學品質有保障
          </div>
        </div>
        </div>
      </div>
    </main>
  );
}
