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

type Teacher = { id: number; name: string; lineUserId: string | null };

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

function PushModal({
  isOpen, onClose, courseType, lessonPlans, palette
}: {
  isOpen: boolean; onClose: () => void; courseType: string; lessonPlans: LessonTemplate[]; palette: any;
}) {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (isOpen) {
      fetch("/api/teachers").then(r => r.json()).then(data => {
        setTeachers((Array.isArray(data) ? data : []).filter((t: any) => t.lineUserId));
      });
      setSelectedIds([]);
      setMsg("");
    }
  }, [isOpen]);

  async function handlePush() {
    if (selectedIds.length === 0) return;
    setLoading(true);
    setMsg("");
    try {
      const res = await fetch("/api/line/push-lesson-plan", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courseType,
          teacherIds: selectedIds,
          lessonPlans: lessonPlans.map(lp => ({ ...lp, color: palette.fg, bg: palette.bg }))
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "發送失敗");
      setMsg("✅ 推播成功！");
      setTimeout(onClose, 1500);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "發送失敗");
    } finally {
      setLoading(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl flex flex-col max-h-[85vh]">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-800">推播教案至 LINE</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>
        
        <div className="mb-4 text-sm text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-100">
          即將發送 <strong>{courseType}</strong> 教案（共 {lessonPlans.length} 堂）<br/>
          請勾選要接收此教案的老師：
        </div>

        {msg && (
          <div className={`mb-4 rounded-lg px-3 py-2 text-sm ${msg.includes("成功") ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
            {msg}
          </div>
        )}

        <div className="flex-1 overflow-y-auto mb-4 border border-slate-200 rounded-lg p-2 space-y-1">
          {teachers.length === 0 ? (
            <div className="p-4 text-center text-sm text-slate-400">載入中或無已綁定之教師...</div>
          ) : (
            teachers.map(t => (
              <label key={t.id} className="flex items-center gap-3 rounded-md px-3 py-2 hover:bg-slate-50 cursor-pointer">
                <input type="checkbox"
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                  checked={selectedIds.includes(t.id)}
                  onChange={(e) => {
                    if (e.target.checked) setSelectedIds([...selectedIds, t.id]);
                    else setSelectedIds(selectedIds.filter(id => id !== t.id));
                  }}
                />
                <span className="text-sm font-medium text-slate-700">{t.name}</span>
              </label>
            ))
          )}
        </div>

        <div className="flex justify-end gap-3 pt-2 border-t border-slate-100 mt-auto">
          <button onClick={onClose} disabled={loading}
            className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100">
            取消
          </button>
          <button onClick={handlePush} disabled={loading || selectedIds.length === 0}
            className="rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors disabled:opacity-50"
            style={{ backgroundColor: palette.fg }}>
            {loading ? "發送中..." : `發送給 ${selectedIds.length} 人`}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function LessonPlanPage() {
  const params = useParams<{ courseType: string }>();
  const rawCourse = decodeURIComponent(String(params?.courseType ?? ""));
  const course = courseLabel(rawCourse);
  const [rows, setRows] = useState<LessonTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [pushModalOpen, setPushModalOpen] = useState(false);
  const [pushTarget, setPushTarget] = useState<LessonTemplate[]>([]);

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
    <>
      <div className="mx-auto w-full max-w-6xl pb-16">
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="px-5 py-6 text-white sm:px-7 relative" style={{ background: `linear-gradient(135deg, ${palette.fg} 0%, ${palette.fg}CC 100%)` }}>
            <div className="text-xs font-semibold tracking-widest opacity-80">WAYSLEADER AI｜教學課表</div>
            <h1 className="mt-1 text-2xl font-black sm:text-3xl">{course || "課程"}課程大綱</h1>
            <p className="mt-2 text-sm leading-6 opacity-90">
              本學期預計 {rows.length} 堂，實際堂數與進度依園所安排。每堂的重點與能力培養，都會對應課後回報內容。
            </p>
            {rows.length > 0 && (
              <button 
                onClick={() => { setPushTarget(rows); setPushModalOpen(true); }}
                className="mt-4 rounded-full bg-white px-5 py-2.5 text-sm font-bold shadow-md hover:scale-105 transition-transform flex items-center gap-2 text-red-500 hover:text-red-600"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
                </svg>
                一鍵推播所有教案
              </button>
            )}
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

            <ol className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {rows.map((row) => (
                <li key={row.lesson}
                  className="rounded-xl border border-slate-100 bg-white p-3 transition-colors hover:border-slate-200 sm:p-4 group relative"
                  style={{ backgroundColor: palette.soft }}>
                  <div className="flex gap-3">
                    <div className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-lg text-center leading-none"
                      style={{ backgroundColor: palette.bg, color: palette.fg }}>
                      <span className="text-[10px] font-bold opacity-70">第</span>
                      <span className="text-base font-black">{row.lesson}</span>
                      <span className="text-[10px] font-bold opacity-70">堂</span>
                    </div>
                    <div className="min-w-0 flex-1 pr-14 sm:pr-20">
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
                      <div className="mt-3 rounded-lg bg-slate-50/50 px-4 py-3 text-[13.5px] leading-relaxed text-slate-600 border border-slate-100">
                        <div className="font-bold text-slate-700 mb-2 flex items-center gap-1.5 border-b border-slate-200 pb-1.5">
                          <svg className="w-4 h-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
                          教案內容參考
                        </div>
                        <p className="whitespace-pre-wrap">{row.activityDirection.replace(/\\n/g, '\n')}</p>
                      </div>
                    )}
                    </div>
                  </div>
                  <button
                    onClick={() => { setPushTarget([row]); setPushModalOpen(true); }}
                    className="absolute right-3 top-3 sm:right-4 sm:top-4 opacity-0 group-hover:opacity-100 transition-opacity rounded-md bg-white border border-slate-200 shadow-sm px-2.5 py-1.5 flex items-center gap-1 hover:bg-slate-50"
                  >
                    <svg className="h-3.5 w-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
                    <span className="text-xs font-medium text-slate-600">推播</span>
                  </button>
                </li>
              ))}
            </ol>
          </div>

          <div className="border-t border-slate-100 bg-slate-50 px-5 py-4 text-xs leading-6 text-slate-500 sm:px-7">
            課表內容如需調整，請與行政聯繫。課後請依課程類別完成進度或人數回報，回報時系統會自動帶入該堂重點。
          </div>
        </div>
      </div>

      <PushModal
        isOpen={pushModalOpen}
        onClose={() => setPushModalOpen(false)}
        courseType={course}
        lessonPlans={pushTarget}
        palette={palette}
      />
    </>
  );
}
