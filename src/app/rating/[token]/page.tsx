"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";

// 安親班課程評分頁（免登入、手機友善）

const SCORE_FIELDS = [
  { key: "scorePunctuality", label: "老師準時度", hint: "老師是否準時到班與下課" },
  { key: "scoreTeaching", label: "教學表現", hint: "課程內容與帶班的專業度" },
  { key: "scoreOrder", label: "班級秩序", hint: "上課秩序與孩子的專注度" },
  { key: "scoreInteraction", label: "與學生互動", hint: "與孩子的互動、鼓勵與關心" },
  { key: "scoreOverall", label: "整體滿意度", hint: "這堂課的整體表現" },
] as const;

const SCORE_WORDS = ["", "需加強", "待改進", "普通", "滿意", "非常滿意"];

const WISH_OPTIONS = ["願意", "需要再觀察", "不建議"] as const;

type Lesson = {
  attendanceId: number;
  school: string;
  courseName: string;
  courseCode: string;
  date: string;
  teacherName: string;
};

type Scores = Record<(typeof SCORE_FIELDS)[number]["key"], number>;

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

  const submit = async () => {
    setFormError("");
    if (SCORE_FIELDS.some(({ key }) => !scores[key])) { setFormError("每個評分項目都需要選擇 1–5 分"); return; }
    if (!wish) { setFormError("請選擇是否願意繼續安排此老師"); return; }
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

  if (loading) return <Shell><p className="py-16 text-center text-gray-500">載入中…</p></Shell>;
  if (error) return <Shell><p className="py-16 text-center text-red-600">{error}</p></Shell>;

  if (done) {
    return (
      <Shell>
        <div className="space-y-4 py-14 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-3xl">✓</div>
          <h1 className="text-xl font-bold text-gray-800">感謝您的回饋</h1>
          <p className="text-sm leading-relaxed text-gray-500">您的評分已送出，我們會依據回饋<br />持續提升教學品質。</p>
          <p className="pt-4 text-xs text-gray-300">WaysLeader AI 才藝課程平台</p>
        </div>
      </Shell>
    );
  }

  if (status === "submitted") {
    return (
      <Shell>
        <LessonCard lesson={lesson} />
        <p className="py-10 text-center text-gray-600">這堂課已完成評分，感謝您的回饋！<br /><span className="text-sm text-gray-400">若需修改，請聯繫我們重新開放。</span></p>
      </Shell>
    );
  }

  if (status === "closed") {
    return <Shell><p className="py-16 text-center text-gray-600">這個評分連結已關閉，若有需要請聯繫我們。</p></Shell>;
  }

  return (
    <Shell>
      <div className="mb-4">
        <div className="text-xs font-semibold tracking-wide text-indigo-500">WaysLeader AI</div>
        <h1 className="text-xl font-bold text-gray-800">課程滿意度評分</h1>
        <p className="mt-0.5 text-xs text-gray-400">約 1 分鐘完成，您的回饋能幫助我們把課上得更好</p>
      </div>
      <LessonCard lesson={lesson} />

      {/* 進度條 */}
      <div className="sticky top-0 z-10 -mx-4 mt-4 bg-gray-50/95 px-4 py-2 backdrop-blur">
        <div className="mb-1 flex justify-between text-xs text-gray-400">
          <span>填寫進度</span>
          <span>{doneSteps}/{totalSteps}</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-gray-200">
          <div className="h-full rounded-full bg-indigo-500 transition-all" style={{ width: `${(doneSteps / totalSteps) * 100}%` }} />
        </div>
      </div>

      <div className="mt-4 space-y-4">
        {SCORE_FIELDS.map(({ key, label, hint }) => (
          <div key={key} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
            <div className="flex items-baseline justify-between">
              <div>
                <span className="text-[15px] font-semibold text-gray-800">{label}</span>
                <p className="mt-0.5 text-xs text-gray-400">{hint}</p>
              </div>
              <span className={`text-xs font-medium ${scores[key] ? "text-amber-600" : "text-gray-300"}`}>
                {scores[key] ? SCORE_WORDS[scores[key]] : "請選擇"}
              </span>
            </div>
            <div className="mt-2 flex gap-1.5">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setScores((prev) => ({ ...prev, [key]: n }))}
                  className={`flex-1 rounded-xl border py-2.5 text-2xl leading-none transition-colors ${scores[key] >= n ? "border-amber-300 bg-amber-50 text-amber-400" : "border-gray-200 bg-white text-gray-200"}`}
                  aria-label={`${label} ${n} 分`}
                >
                  ★
                </button>
              ))}
            </div>
          </div>
        ))}

        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
          <span className="text-[15px] font-semibold text-gray-800">是否願意繼續安排此老師</span>
          <div className="mt-2 flex gap-2">
            {WISH_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setWish(option)}
                className={`flex-1 rounded-xl border py-2.5 text-sm font-medium transition-colors ${wish === option ? "border-indigo-600 bg-indigo-600 text-white" : "border-gray-200 bg-white text-gray-600"}`}
              >
                {option}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
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

function LessonCard({ lesson }: { lesson: Lesson | null }) {
  if (!lesson) return null;
  return (
    <div className="rounded-2xl border border-indigo-100 bg-indigo-50/60 p-4 text-sm">
      <div className="text-[15px] font-bold text-gray-800">{lesson.school}</div>
      <div className="mt-1 space-y-0.5 text-gray-600">
        <div>{lesson.courseName}（{lesson.courseCode}）</div>
        <div>上課日期：{lesson.date}｜老師：{lesson.teacherName}</div>
      </div>
    </div>
  );
}
