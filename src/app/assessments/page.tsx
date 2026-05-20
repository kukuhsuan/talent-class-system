"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { parseScores, scoreAverage } from "@/lib/kindergartenAssessment";

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
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

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
  const months = Array.from({ length: 12 }, (_, i) => i + 1);
  const years = [2024, 2025, 2026, 2027];

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">幼兒園學期評量</h1>
          <p className="text-sm text-slate-500">查看幼兒運動評量、AI 成長評語與電子證書</p>
        </div>
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
          <span className="ml-auto text-sm text-slate-400">共 {rows.length} 筆</span>
        </div>
      </div>

      {loading ? (
        <div className="py-12 text-center text-slate-400">載入中...</div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white py-12 text-center text-slate-400">尚無學期評量紀錄</div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {rows.map((row) => {
            const avg = scoreAverage(parseScores(row.scores));
            return (
              <div key={row.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-lg font-bold text-slate-800">{row.childName}</div>
                    <div className="mt-1 text-sm text-slate-500">{row.school}｜{row.courseName}｜{row.semester}</div>
                    <div className="mt-1 text-xs text-slate-400">{new Date(row.date).toLocaleDateString("zh-TW")}｜{row.teacherName}</div>
                  </div>
                  <span className="rounded-full bg-[#F3E7D0] px-3 py-1 text-xs font-bold text-[#6E4C1E]">{row.title}</span>
                </div>
                <div className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-sm leading-6 text-slate-600">{row.comment}</div>
                <div className="mt-4 flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold text-[#3F6B55]">平均 {avg.toFixed(1)} 分</span>
                  <Link href={`/assessments/${row.id}/certificate`} className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white">
                    查看 / 匯出證書
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
