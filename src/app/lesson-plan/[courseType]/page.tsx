"use client";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { courseLabel } from "@/lib/courseMeta";

type LessonTemplate = {
  lesson: number;
  title: string;
  focus: string;
  skills: string[];
  activityDirection: string;
};

// 依課程名稱配色（與 LINE 通知色塊同一套邏輯，同課程每次同色）
const PALETTES = [
  { fg: "#2C5DA8", bg: "#EAF1FB", soft: "#F6F9FE" },
  { fg: "#3E8E5A", bg: "#EAF6EE", soft: "#F5FBF7" },
  { fg: "#B0722B", bg: "#FBF3E6", soft: "#FDF9F2" },
  { fg: "#7D4CA0", bg: "#F4EDFA", soft: "#FAF7FD" },
  { fg: "#C0564B", bg: "#FBEDEB", soft: "#FDF6F5" },
  { fg: "#2A8C8C", bg: "#E9F6F6", soft: "#F4FBFB" },
];

function paletteFor(key: string) {
  let hash = 0;
  for (const ch of key) hash = (hash * 31 + (ch.codePointAt(0) ?? 0)) >>> 0;
  return PALETTES[hash % PALETTES.length];
}

export default function LessonPlanPage() {
  const params = useParams<{ courseType: string }>();
  const rawCourse = decodeURIComponent(String(params?.courseType ?? ""));
  const course = courseLabel(rawCourse);
  const [rows, setRows] = useState<LessonTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!course) return;
    let cancelled = false;
    setLoading(true);
    fetch(`/api/lesson-plan/${encodeURIComponent(course)}`)
      .then((res) => {
        if (!res.ok) throw new Error("課表載入失敗，請稍後再試或聯繫行政");
        return res.json();
      })
      .then((data: { items?: LessonTemplate[] }) => {
        if (cancelled) return;
        setRows([...(data.items ?? [])].sort((a, b) => a.lesson - b.lesson));
        setLoading(false);
      })
      .catch((e: Error) => {
        if (cancelled) return;
        setError(e.message || "課表載入失敗");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [course]);

  const palette = useMemo(() => paletteFor(course || "課程"), [course]);
  const skillTags = useMemo(
    () => [...new Set(rows.flatMap((row) => row.skills).filter(Boolean))],
    [rows],
  );

  return (
    <div className="mx-auto w-full max-w-3xl pb-16">
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="px-5 py-6 text-white sm:px-7" style={{ background: `linear-gradient(135deg, ${palette.fg} 0%, ${palette.fg}CC 100%)` }}>
          <div className="text-xs font-semibold tracking-widest opacity-80">WAYSLEADER AI｜教學課表</div>
          <h1 className="mt-1 text-2xl font-black sm:text-3xl">{course || "課程"}課程大綱</h1>
          <p className="mt-2 text-sm leading-6 opacity-90">
            本學期共 {rows.length} 堂，依序上課即可。每堂的重點與能力培養，都會對應課後回報內容。
          </p>
        </div>

        {skillTags.length > 0 && (
          <div className="border-b border-slate-100 px-5 py-4 sm:px-7">
            <div className="mb-2 text-xs font-bold text-slate-500">本學期能力培養重點</div>
            <div className="flex flex-wrap gap-1.5">
              {skillTags.map((skill) => (
                <span key={skill} className="rounded-full px-2.5 py-1 text-xs font-semibold"
                  style={{ backgroundColor: palette.bg, color: palette.fg }}>
                  {skill}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="px-3 py-4 sm:px-5">
          {loading && <div className="py-16 text-center text-sm text-slate-400">課表載入中…</div>}
          {!loading && error && <div className="py-16 text-center text-sm text-red-500">{error}</div>}
          {!loading && !error && rows.length === 0 && (
            <div className="py-16 text-center text-sm text-slate-400">此課程尚未建立教學課表，請聯繫行政。</div>
          )}

          <ol className="space-y-2.5">
            {rows.map((row) => (
              <li key={row.lesson}
                className="rounded-xl border border-slate-100 bg-white p-3 transition-colors hover:border-slate-200 sm:p-4"
                style={{ backgroundColor: palette.soft }}>
                <div className="flex gap-3">
                  <div className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-lg text-center leading-none"
                    style={{ backgroundColor: palette.bg, color: palette.fg }}>
                    <span className="text-[10px] font-bold opacity-70">第</span>
                    <span className="text-base font-black">{row.lesson}</span>
                    <span className="text-[10px] font-bold opacity-70">堂</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-[15px] font-bold text-slate-800">{row.title}</h2>
                      {row.skills.map((skill) => (
                        <span key={skill} className="rounded-full border px-2 py-0.5 text-[11px] font-semibold"
                          style={{ borderColor: palette.bg, backgroundColor: "#FFFFFF", color: palette.fg }}>
                          {skill}
                        </span>
                      ))}
                    </div>
                    <p className="mt-1.5 whitespace-pre-wrap text-[13px] leading-6 text-slate-600">
                      {row.focus || "本堂重點尚未填寫"}
                    </p>
                    {row.activityDirection && (
                      <p className="mt-2 rounded-lg bg-white px-3 py-2 text-[12px] leading-5 text-slate-500">
                        <span className="font-bold text-slate-600">成果短文參考：</span>
                        {row.activityDirection}
                      </p>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </div>

        <div className="border-t border-slate-100 bg-slate-50 px-5 py-4 text-xs leading-6 text-slate-500 sm:px-7">
          課表內容如需調整，請與行政聯繫。課後請依課程類別完成進度或人數回報，回報時系統會自動帶入該堂重點。
        </div>
      </div>
    </div>
  );
}
