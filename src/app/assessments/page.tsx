"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Toast } from "@/components/Toast";
import { parseScores, scoreAverage } from "@/lib/kindergartenAssessment";
import { useToast } from "@/lib/useToast";

type Row = {
  id: number;
  attendanceId: number;
  childName: string;
  semester: string;
  courseName: string;
  scores: string;
  comment: string;
  title: string;
  createdAt: string;
  date: string;
  school: string;
  department: string;
  teacherName: string;
};

export default function AssessmentsPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [school, setSchool] = useState("");
  const [course, setCourse] = useState("");
  const [child, setChild] = useState("");
  const [date, setDate] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast, showToast } = useToast();

  useEffect(() => {
    const params = new URLSearchParams({ year: String(year), month: String(month) });
    if (school) params.set("school", school);
    setLoading(true);
    fetch(`/api/assessments?${params}`)
      .then((r) => r.json())
      .then(setRows)
      .finally(() => setLoading(false));
  }, [year, month, school]);

  const schools = useMemo(() => [...new Set(rows.map((row) => row.school))].sort(), [rows]);
  const courses = useMemo(() => [...new Set(rows.map((row) => row.courseName))].sort(), [rows]);
  const filteredRows = useMemo(() => rows.filter((row) => {
    if (school && row.school !== school) return false;
    if (course && row.courseName !== course) return false;
    if (child && !row.childName.includes(child.trim())) return false;
    if (date && new Date(row.date).toISOString().slice(0, 10) !== date) return false;
    return true;
  }), [rows, school, course, child, date]);
  const batchUrl = filteredRows.length ? `/assessments/batch?ids=${filteredRows.map((row) => row.id).join(",")}` : "";
  const months = Array.from({ length: 12 }, (_, i) => i + 1);
  const years = [2024, 2025, 2026, 2027];

  async function deleteAssessment(id: number) {
    if (!confirm("確定要刪除這份證書／評量紀錄嗎？刪除後無法復原。")) return;
    const res = await fetch(`/api/assessments/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      showToast("error", data.error || "刪除失敗", 3000);
      return;
    }
    setRows((items) => items.filter((row) => row.id !== id));
    showToast("success", "刪除成功");
  }

  async function regenerateAssessment(id: number) {
    const res = await fetch(`/api/assessments/${id}`, { method: "PUT" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      showToast("error", data.error || "重新產生失敗", 3000);
      return;
    }
    setRows((items) => items.map((row) => row.id === id ? { ...row, comment: data.comment, title: data.title } : row));
    showToast("success", "AI 評語已重新產生");
  }

  return (
    <div>
      <Toast toast={toast} />
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">幼兒園學期評量</h1>
          <p className="text-sm text-slate-500">查看幼兒運動評量、AI 成長評語與電子證書</p>
        </div>
        {batchUrl && (
          <Link href={batchUrl} className="rounded-lg bg-[#0756B7] px-4 py-2 text-sm font-semibold text-white">
            批次產生證書 / PDF
          </Link>
        )}
      </div>

      <div className="mb-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm text-slate-600">年份</label>
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
            {years.map((y) => <option key={y}>{y}</option>)}
          </select>
          <label className="text-sm text-slate-600">月份</label>
          <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
            {months.map((m) => <option key={m} value={m}>{m}月</option>)}
          </select>
          <label className="text-sm text-slate-600">園所</label>
          <select value={school} onChange={(e) => setSchool(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
            <option value="">全部</option>
            {schools.map((s) => <option key={s}>{s}</option>)}
          </select>
          <label className="text-sm text-slate-600">課程</label>
          <select value={course} onChange={(e) => setCourse(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
            <option value="">全部</option>
            {courses.map((c) => <option key={c}>{c}</option>)}
          </select>
          <input value={child} onChange={(e) => setChild(e.target.value)} placeholder="搜尋孩子姓名"
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
          <input value={date} onChange={(e) => setDate(e.target.value)} type="date"
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
          <button onClick={() => { setSchool(""); setCourse(""); setChild(""); setDate(""); }} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600">
            清除篩選
          </button>
          <span className="ml-auto text-sm text-slate-400">共 {filteredRows.length} 筆</span>
        </div>
      </div>

      {loading ? (
        <div className="py-12 text-center text-slate-400">載入中...</div>
      ) : filteredRows.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white py-12 text-center text-slate-400">尚無學期評量紀錄</div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {filteredRows.map((row) => {
            const avg = scoreAverage(parseScores(row.scores));
            return (
              <div key={row.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-lg font-bold text-slate-800">{row.childName}</div>
                    <div className="mt-1 text-sm text-slate-500">{row.school}｜{row.courseName}</div>
                    <div className="mt-1 text-xs text-slate-400">{new Date(row.date).toLocaleDateString("zh-TW")}｜{row.teacherName}</div>
                  </div>
                  <span className="rounded-full bg-[#F3E7D0] px-3 py-1 text-xs font-bold text-[#6E4C1E]">{row.title}</span>
                </div>
                <div className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-sm leading-6 text-slate-600">{row.comment}</div>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-[#3F6B55]">平均 {avg.toFixed(1)} 分</span>
                  <div className="flex flex-wrap gap-2">
                    <Link href={`/assessments/${row.id}/certificate`} className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white">查看</Link>
                    <Link href={`/assessments/${row.id}/certificate`} className="rounded-lg bg-[#B68A4C] px-3 py-2 text-sm font-semibold text-white">下載 PDF</Link>
                    <button onClick={() => regenerateAssessment(row.id)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600">重新產生</button>
                    <button onClick={() => deleteAssessment(row.id)} className="rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-600">刪除</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
