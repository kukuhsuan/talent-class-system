"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Toast } from "@/components/Toast";
import { useToast } from "@/lib/useToast";

// 後台：安親班評分管理（列表＋篩選＋複製連結＋重新開放）

type RatingItem = {
  id: number;
  attendanceId: number;
  token: string;
  status: string;
  scorePunctuality: number;
  scoreTeaching: number;
  scoreOrder: number;
  scoreInteraction: number;
  scoreOverall: number;
  feedback: string;
  continueWish: string;
  submittedAt: string | null;
  date: string;
  school: string;
  courseName: string;
  courseCode: string;
  teacherId: number;
  teacherName: string;
};

const SCORE_COLUMNS = [
  { key: "scorePunctuality", label: "準時" },
  { key: "scoreTeaching", label: "教學" },
  { key: "scoreOrder", label: "秩序" },
  { key: "scoreInteraction", label: "互動" },
  { key: "scoreOverall", label: "整體" },
] as const;

const STATUS_LABEL: Record<string, string> = { open: "待填寫", submitted: "已評分", closed: "已關閉" };

export default function RatingsPage() {
  const { toast, showToast } = useToast();
  const [items, setItems] = useState<RatingItem[]>([]);
  const [loading, setLoading] = useState(true);
  // 支援 /ratings?school=xxx 直接帶入安親班篩選（例如從園所管理的「歷史評分」進來）
  const [fSchool, setFSchool] = useState(() =>
    typeof window === "undefined" ? "" : (new URLSearchParams(window.location.search).get("school") ?? ""),
  );
  const [fTeacher, setFTeacher] = useState("");
  const [fCourse, setFCourse] = useState("");
  const [fMonth, setFMonth] = useState(""); // YYYY-MM
  const [fLow, setFLow] = useState(false); // 只看整體 < 3

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/course-ratings");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "載入失敗");
      setItems(data);
    } catch (error) {
      showToast("error", (error as Error).message || "載入失敗", 3000);
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { void load(); }, [load]);

  const schools = useMemo(
    () => [...new Set([...items.map((i) => i.school), ...(fSchool ? [fSchool] : [])])].sort(),
    [items, fSchool],
  );
  const teachers = useMemo(() => [...new Set(items.map((i) => i.teacherName).filter(Boolean))].sort(), [items]);
  const courses = useMemo(() => [...new Set(items.map((i) => `${i.courseName}｜${i.courseCode}`))].sort(), [items]);

  const filtered = useMemo(() => items.filter((i) =>
    (!fSchool || i.school === fSchool)
    && (!fTeacher || i.teacherName === fTeacher)
    && (!fCourse || `${i.courseName}｜${i.courseCode}` === fCourse)
    && (!fMonth || i.date.startsWith(fMonth))
    && (!fLow || (i.status === "submitted" && i.scoreOverall < 3)),
  ), [items, fSchool, fTeacher, fCourse, fMonth, fLow]);

  const submitted = filtered.filter((i) => i.status === "submitted");
  const avgOverall = submitted.length
    ? (submitted.reduce((sum, i) => sum + i.scoreOverall, 0) / submitted.length).toFixed(1)
    : "-";

  const copyLink = async (item: RatingItem) => {
    const url = `${window.location.origin}/rating/${item.token}`;
    // 一鍵複製整段 LINE 訊息（含課程資訊＋填寫說明），貼上就能直接發送
    const message = [
      `【課程評分邀請】${item.school}`,
      `課程：${item.courseName}（${item.courseCode}）`,
      `日期：${item.date}`,
      `授課老師：${item.teacherName}`,
      "",
      "麻煩協助為這堂課評分（約 1 分鐘，點連結即可填寫、免登入）：",
      url,
      "",
      "感謝您的回饋！",
    ].join("\n");
    try {
      await navigator.clipboard.writeText(message);
      showToast("success", "評分邀請訊息已複製，可直接貼到 LINE 發送");
    } catch {
      window.prompt("請手動複製評分邀請訊息：", message);
    }
  };

  const reopen = async (item: RatingItem) => {
    if (!confirm(`確定重新開放 ${item.school} ${item.date} 的評分？原本的評分內容會被覆蓋。`)) return;
    const res = await fetch(`/api/course-ratings/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reopen" }),
    });
    const data = await res.json();
    if (!res.ok) { showToast("error", data.error ?? "操作失敗"); return; }
    showToast("success", "已重新開放，安親班可再次填寫");
    void load();
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <Toast toast={toast} />
      <div className="mb-4">
        <h1 className="text-xl font-bold text-slate-900">安親班評分管理</h1>
        <p className="mt-1 text-sm text-slate-500">每堂安親班課程的專屬評分連結與回饋結果；整體滿意度低於 3 分會自動進入待處理中心。</p>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select value={fSchool} onChange={(e) => setFSchool(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
          <option value="">全部安親班</option>
          {schools.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={fTeacher} onChange={(e) => setFTeacher(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
          <option value="">全部老師</option>
          {teachers.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={fCourse} onChange={(e) => setFCourse(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
          <option value="">全部課程</option>
          {courses.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <input type="month" value={fMonth} onChange={(e) => setFMonth(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
        <label className="flex items-center gap-1.5 text-sm text-slate-600">
          <input type="checkbox" checked={fLow} onChange={(e) => setFLow(e.target.checked)} />
          只看低分（整體 &lt; 3）
        </label>
        <span className="ml-auto text-sm text-slate-500">已評分 {submitted.length} 筆｜整體平均 {avgOverall} 分</span>
      </div>

      {loading ? (
        <div className="rounded-xl border border-slate-200 bg-white py-12 text-center text-slate-400">載入中…</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white py-12 text-center text-slate-400">
          目前沒有評分資料，請先到「上課紀錄」的安親班課程按「評分連結」產生連結。
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-[960px] text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-3 py-3 text-left font-semibold">日期</th>
                <th className="px-3 py-3 text-left font-semibold">安親班</th>
                <th className="px-3 py-3 text-left font-semibold">課程</th>
                <th className="px-3 py-3 text-left font-semibold">老師</th>
                {SCORE_COLUMNS.map((c) => <th key={c.key} className="px-2 py-3 text-center font-semibold">{c.label}</th>)}
                <th className="px-3 py-3 text-left font-semibold">續排意願</th>
                <th className="px-3 py-3 text-left font-semibold">意見回饋</th>
                <th className="px-3 py-3 text-left font-semibold">狀態</th>
                <th className="px-3 py-3 text-left font-semibold">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((item) => {
                const low = item.status === "submitted" && item.scoreOverall < 3;
                return (
                  <tr key={item.id} className={low ? "bg-rose-50/60" : "hover:bg-slate-50/70"}>
                    <td className="px-3 py-3 whitespace-nowrap">{item.date}</td>
                    <td className="px-3 py-3">{item.school}</td>
                    <td className="px-3 py-3">
                      <div>{item.courseName}</div>
                      <div className="font-mono text-xs text-slate-400">{item.courseCode}</div>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">{item.teacherName}</td>
                    {SCORE_COLUMNS.map((c) => (
                      <td key={c.key} className="px-2 py-3 text-center">
                        {item.status === "submitted"
                          ? <span className={c.key === "scoreOverall" && low ? "font-bold text-rose-600" : ""}>{item[c.key]}</span>
                          : <span className="text-slate-300">-</span>}
                      </td>
                    ))}
                    <td className="px-3 py-3 whitespace-nowrap">
                      {item.status === "submitted" ? (
                        <span className={`rounded-full px-2 py-0.5 text-xs ${
                          item.continueWish.includes("願意") ? "bg-green-100 text-green-700"
                          : (item.continueWish.includes("不建議") || item.continueWish.includes("暫不")) ? "bg-rose-100 text-rose-700"
                          : "bg-amber-100 text-amber-700"
                        }`}>{item.continueWish}</span>
                      ) : <span className="text-slate-300">-</span>}
                    </td>
                    <td className="max-w-[240px] px-3 py-3 text-xs text-slate-600" title={item.feedback}>
                      <div className="line-clamp-2 whitespace-pre-wrap">{item.feedback || "-"}</div>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <span className={`rounded-full px-2 py-0.5 text-xs ${
                        item.status === "submitted" ? "bg-green-100 text-green-700"
                        : item.status === "open" ? "bg-slate-100 text-slate-500"
                        : "bg-slate-200 text-slate-500"
                      }`}>{STATUS_LABEL[item.status] ?? item.status}</span>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <div className="flex gap-3">
                        <button onClick={() => copyLink(item)} className="font-medium text-indigo-600 hover:text-indigo-800">複製連結</button>
                        {item.status === "submitted" && (
                          <button onClick={() => reopen(item)} className="font-medium text-amber-600 hover:text-amber-800">重新開放</button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
