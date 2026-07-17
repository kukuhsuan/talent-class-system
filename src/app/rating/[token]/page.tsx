"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";

// 安親班課程評分頁（免登入、手機友善）

const SCORE_FIELDS = [
  { key: "scorePunctuality", label: "老師準時度" },
  { key: "scoreTeaching", label: "教學表現" },
  { key: "scoreOrder", label: "班級秩序" },
  { key: "scoreInteraction", label: "與學生互動" },
  { key: "scoreOverall", label: "整體滿意度" },
] as const;

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
    } catch {
      setFormError("送出失敗，請稍後再試");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <Shell><p className="text-center text-gray-500 py-16">載入中…</p></Shell>;
  if (error) return <Shell><p className="text-center text-red-600 py-16">{error}</p></Shell>;

  if (done) {
    return (
      <Shell>
        <div className="text-center py-16 space-y-3">
          <div className="text-4xl">✅</div>
          <h1 className="text-xl font-bold text-gray-800">感謝您的回饋</h1>
          <p className="text-sm text-gray-500">您的評分已送出，我們會持續提升教學品質。</p>
        </div>
      </Shell>
    );
  }

  if (status === "submitted") {
    return (
      <Shell>
        <LessonCard lesson={lesson} />
        <p className="text-center text-gray-600 py-10">這堂課已完成評分，感謝您的回饋！<br /><span className="text-sm text-gray-400">若需修改，請聯繫我們重新開放。</span></p>
      </Shell>
    );
  }

  if (status === "closed") {
    return <Shell><p className="text-center text-gray-600 py-16">這個評分連結已關閉，若有需要請聯繫我們。</p></Shell>;
  }

  return (
    <Shell>
      <h1 className="text-lg font-bold text-gray-800 mb-3">課程滿意度評分</h1>
      <LessonCard lesson={lesson} />
      <div className="space-y-5 mt-5">
        {SCORE_FIELDS.map(({ key, label }) => (
          <div key={key}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium text-gray-700">{label}</span>
              <span className="text-xs text-gray-400">{scores[key] ? `${scores[key]} 分` : "請選擇"}</span>
            </div>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setScores((prev) => ({ ...prev, [key]: n }))}
                  className={`flex-1 py-2 rounded-lg border text-lg ${scores[key] >= n ? "bg-amber-400 border-amber-400 text-white" : "bg-white border-gray-200 text-gray-300"}`}
                  aria-label={`${label} ${n} 分`}
                >
                  ★
                </button>
              ))}
            </div>
          </div>
        ))}
        <div>
          <span className="text-sm font-medium text-gray-700">是否願意繼續安排此老師</span>
          <div className="flex gap-2 mt-1">
            {WISH_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setWish(option)}
                className={`flex-1 py-2 rounded-lg border text-sm ${wish === option ? "bg-indigo-600 border-indigo-600 text-white" : "bg-white border-gray-200 text-gray-600"}`}
              >
                {option}
              </button>
            ))}
          </div>
        </div>
        <div>
          <span className="text-sm font-medium text-gray-700">意見回饋（選填）</span>
          <textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            rows={4}
            maxLength={2000}
            placeholder="想對我們或老師說的話…"
            className="mt-1 w-full rounded-lg border border-gray-200 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
        </div>
        {formError && <p className="text-sm text-red-600">{formError}</p>}
        <button
          type="button"
          onClick={submit}
          disabled={submitting}
          className="w-full py-3 rounded-xl bg-indigo-600 text-white font-semibold disabled:opacity-50"
        >
          {submitting ? "送出中…" : "送出評分"}
        </button>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-md mx-auto px-4 py-6">{children}</div>
    </div>
  );
}

function LessonCard({ lesson }: { lesson: Lesson | null }) {
  if (!lesson) return null;
  return (
    <div className="rounded-xl bg-white border border-gray-100 shadow-sm p-4 text-sm space-y-1">
      <div className="font-semibold text-gray-800">{lesson.school}</div>
      <div className="text-gray-600">{lesson.courseName}（{lesson.courseCode}）</div>
      <div className="text-gray-600">上課日期：{lesson.date}</div>
      <div className="text-gray-600">上課老師：{lesson.teacherName}</div>
    </div>
  );
}
