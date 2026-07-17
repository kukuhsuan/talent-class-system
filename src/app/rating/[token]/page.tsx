"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";

// 安親班課程評分頁（免登入、手機友善）— 運動班長品牌

const SCORE_FIELDS = [
  { key: "scorePunctuality", label: "準時與課前準備", hint: "老師是否準時到班、課前準備充分" },
  { key: "scoreTeaching", label: "教學內容與專業", hint: "課程內容與教學的專業度" },
  { key: "scoreOrder", label: "課堂帶領與秩序", hint: "活動帶領的流暢度與課堂氛圍" },
  { key: "scoreInteraction", label: "與孩子的互動", hint: "與孩子的互動、鼓勵與關心" },
  { key: "scoreOverall", label: "整體課程滿意度", hint: "這堂課的整體表現" },
] as const;

const SCORE_WORDS = ["", "需加強", "待改進", "普通", "滿意", "非常滿意"];

const WISH_OPTIONS = ["願意繼續安排", "仍需觀察", "暫不安排"] as const;

type Lesson = {
  attendanceId: number;
  school: string;
  courseName: string;
  courseCode: string;
  date: string;
  teacherName: string;
};

type Scores = Record<(typeof SCORE_FIELDS)[number]["key"], number>;

// 2026-07-09 → 7月9日
function dateLabel(iso: string) {
  const [, m, d] = iso.split("-").map(Number);
  return m && d ? `${m}月${d}日` : iso;
}

export default function RatingPage() {
  const params = useParams<{ token: string }>();
  const token = params?.token ?? "";
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [status, setStatus] = useState("");
  const [scores, setScores] = useState<Scores>({
    scorePunctuality: 0, scoreTeaching: 0, scoreOrder: 0, scoreInteraction: 0, scoreOverall: 0,
  });
  const [feedback, setFeedback] = useState("");
  const [wish, setWish] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [formError, setFormError] = useState("");
  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/rating/${token}`);
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "載入失敗"); return; }
      setLesson(data.lesson);
      setStatus(data.status);
    } catch {
      setError("載入失敗，請稍後再試");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { if (token) load(); }, [token, load]);

  // 進度：5 個評分項＋續排意願，共 6 步
  const doneSteps = SCORE_FIELDS.filter(({ key }) => scores[key] > 0).length + (wish ? 1 : 0);
  const totalSteps = SCORE_FIELDS.length + 1;

  // 選完一題後平順滑到下一題（重選已完成的題目則留在原處）
  const pickScore = (key: keyof Scores, n: number) => {
    const firstTime = scores[key] === 0;
    setScores((prev) => ({ ...prev, [key]: n }));
    if (!firstTime) return;
    const idx = SCORE_FIELDS.findIndex((f) => f.key === key);
    const nextKey = idx < SCORE_FIELDS.length - 1 ? SCORE_FIELDS[idx + 1].key : "wish";
    window.setTimeout(() => {
      itemRefs.current[nextKey]?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 250);
  };

  const pickWish = (option: string) => {
    const firstTime = !wish;
    setWish(option);
    if (!firstTime) return;
    window.setTimeout(() => {
      itemRefs.current.feedback?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 250);
  };

  const submit = async () => {
    if (submitting) return; // 防止重複送出
    setFormError("");
    if (SCORE_FIELDS.some(({ key }) => !scores[key])) { setFormError("每個評分項目都需要選擇 1–5 分"); return; }
    if (!wish) { setFormError("請選擇是否繼續安排此老師"); return; }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/rating/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...scores, feedback, continueWish: wish }),
      });
      const data = await res.json();
      if (!res.ok) { setFormError(data.error ?? "送出失敗"); return; }
      setDone(true);
      window.scrollTo({ top: 0 });
    } catch {
      setFormError("送出失敗，請稍後再試");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    // 骨架畫面：避免長時間空白
    return (
      <Shell>
        <BrandHeader />
        <div className="mt-4 animate-pulse space-y-4">
          <div className="h-24 rounded-2xl bg-slate-200/70" />
          {[0, 1, 2].map((i) => <div key={i} className="h-32 rounded-2xl bg-slate-100" />)}
        </div>
        <p className="mt-6 text-center text-xs font-semibold text-gray-400">正在載入課程資料…</p>
      </Shell>
    );
  }
  if (error) return <Shell><BrandHeader /><p className="py-16 text-center text-red-600">{error}</p><Footer /></Shell>;

  if (done) {
    return (
      <Shell>
        <BrandHeader />
        <div className="space-y-4 py-12 text-center">
          <div className="mx-auto flex h-20 w-20 animate-[pop_0.4s_ease-out] items-center justify-center rounded-full bg-green-500 text-4xl text-white shadow-lg shadow-green-200">✓</div>
          <style>{`@keyframes pop{0%{transform:scale(0.3);opacity:0}70%{transform:scale(1.15)}100%{transform:scale(1);opacity:1}}`}</style>
          <h1 className="text-xl font-bold text-gray-800">評分已完成，感謝您的回饋！</h1>
          {lesson && (
            <p className="text-sm leading-relaxed text-gray-600">
              {lesson.teacherName} 老師｜{dateLabel(lesson.date)} {lesson.courseName}課程已完成評分
            </p>
          )}
          <p className="text-xs leading-relaxed text-gray-400">我們會依據您的回饋，持續提升教學品質。</p>
          <button
            type="button"
            onClick={() => { window.close(); }}
            className="mt-2 rounded-2xl border border-gray-200 bg-white px-8 py-3 text-sm font-semibold text-gray-600"
          >
            關閉頁面
          </button>
        </div>
        <Footer />
      </Shell>
    );
  }

  if (status === "submitted") {
    return (
      <Shell>
        <BrandHeader />
        <div className="mt-4"><LessonCard lesson={lesson} /></div>
        <p className="py-10 text-center text-gray-600">這堂課已完成評分，感謝您的回饋！<br /><span className="text-sm text-gray-400">若需修改，請聯繫我們重新開放。</span></p>
        <Footer />
      </Shell>
    );
  }

  if (status === "closed") {
    return <Shell><BrandHeader /><p className="py-16 text-center text-gray-600">這個評分連結已關閉，若有需要請聯繫我們。</p><Footer /></Shell>;
  }

  return (
    <Shell>
      <BrandHeader />
      <h1 className="mt-4 text-xl font-bold text-gray-800">
        {lesson ? `請為本次${lesson.courseName}課程評分` : "課程滿意度評分"}
      </h1>
      <p className="mt-0.5 text-xs text-gray-400">約 1 分鐘完成，您的回饋能幫助我們把課上得更好</p>
      <div className="mt-3">
        <LessonCard lesson={lesson} />
      </div>

      {/* 進度條 */}
      <div className="sticky top-0 z-10 -mx-4 mt-4 bg-gray-50/95 px-4 py-2 backdrop-blur">
        <div className="mb-1 flex justify-between text-xs text-gray-400">
          <span>填寫進度</span>
          <span>{doneSteps}/{totalSteps}</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-gray-200">
          <div className="h-full rounded-full bg-indigo-500 transition-all duration-300" style={{ width: `${(doneSteps / totalSteps) * 100}%` }} />
        </div>
      </div>

      <div className="mt-4 space-y-4">
        {SCORE_FIELDS.map(({ key, label, hint }) => (
          <div
            key={key}
            ref={(el) => { itemRefs.current[key] = el; }}
            className={`rounded-2xl border bg-white p-4 shadow-sm transition-colors ${scores[key] ? "border-green-200" : "border-gray-100"}`}
          >
            <div className="flex items-baseline justify-between">
              <div>
                <span className="text-[15px] font-semibold text-gray-800">{label}</span>
                <p className="mt-0.5 text-xs text-gray-400">{hint}</p>
              </div>
              <span className={`text-xs font-medium ${scores[key] ? "text-green-600" : "text-gray-300"}`}>
                {scores[key] ? `✓ ${SCORE_WORDS[scores[key]]}` : "請選擇"}
              </span>
            </div>
            <div className="mt-2 flex gap-1.5">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => pickScore(key, n)}
                  className={`flex-1 rounded-xl border py-2.5 text-2xl leading-none transition-colors ${scores[key] >= n ? "border-amber-300 bg-amber-50 text-amber-400" : "border-gray-200 bg-white text-gray-200"}`}
                  aria-label={`${label} ${n} 分`}
                >
                  ★
                </button>
              ))}
            </div>
            <div className="mt-1.5 flex justify-between text-[11px] text-gray-300">
              <span>1分 需加強</span>
              <span>5分 非常滿意</span>
            </div>
          </div>
        ))}

        <div
          ref={(el) => { itemRefs.current.wish = el; }}
          className={`rounded-2xl border bg-white p-4 shadow-sm transition-colors ${wish ? "border-green-200" : "border-gray-100"}`}
        >
          <div className="flex items-baseline justify-between">
            <span className="text-[15px] font-semibold text-gray-800">是否繼續安排此老師</span>
            {wish && <span className="text-xs font-medium text-green-600">✓ 已選擇</span>}
          </div>
          <div className="mt-2 flex gap-2">
            {WISH_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => pickWish(option)}
                className={`flex-1 rounded-xl border py-2.5 text-[13px] font-medium transition-colors ${wish === option ? "border-indigo-600 bg-indigo-600 text-white" : "border-gray-200 bg-white text-gray-600"}`}
              >
                {option}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[11px] leading-4 text-gray-400">此項僅作為後續排課與教學改善參考，不會直接顯示給老師。</p>
        </div>

        <div ref={(el) => { itemRefs.current.feedback = el; }} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
          <span className="text-[15px] font-semibold text-gray-800">意見回饋<span className="ml-1 text-xs font-normal text-gray-400">選填</span></span>
          <textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            rows={4}
            maxLength={2000}
            placeholder="想對我們或老師說的話…"
            className="mt-2 w-full rounded-xl border border-gray-200 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
        </div>

        {formError && <p className="text-sm text-red-600">{formError}</p>}
        <button
          type="button"
          onClick={submit}
          disabled={submitting}
          className="w-full rounded-2xl bg-indigo-600 py-3.5 font-semibold text-white shadow-md shadow-indigo-200 disabled:opacity-50"
        >
          {submitting ? "送出中…" : "送出評分"}
        </button>
        <p className="pb-2 text-center text-xs text-gray-300">評分結果僅供內部教學品質管理使用</p>
      </div>
      <Footer />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-md px-4 py-6">{children}</div>
    </div>
  );
}

function BrandHeader() {
  return (
    <div className="flex items-center gap-3">
      {/* 運動班長 Logo：載入失敗時自動隱藏，僅留文字品牌 */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/sports-monitor-logo.png"
        alt="運動班長"
        className="h-12 w-12 rounded-xl bg-white object-contain shadow-sm ring-1 ring-slate-200"
        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
      />
      <div>
        <div className="text-base font-black text-[#1e2a63]">運動班長｜課程回饋</div>
        <div className="text-[11px] font-semibold text-gray-400">Kids Sports 兒童運動課程</div>
      </div>
    </div>
  );
}

function Footer() {
  return <p className="pt-6 pb-2 text-center text-[10px] text-gray-300">系統技術支援：WaysLeader AI</p>;
}

function LessonCard({ lesson }: { lesson: Lesson | null }) {
  if (!lesson) return null;
  return (
    <div className="rounded-2xl border border-indigo-100 bg-indigo-50/60 p-4 text-sm">
      <div className="text-[15px] font-bold text-gray-800">{lesson.school}</div>
      <div className="mt-1 space-y-0.5 text-gray-600">
        <div>{dateLabel(lesson.date)}｜{lesson.courseName}課程</div>
        <div>授課老師：{lesson.teacherName} 老師</div>
      </div>
    </div>
  );
}
