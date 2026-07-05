"use client";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { groupAverages, parseScores } from "@/lib/kindergartenAssessment";
import { AssessmentAbilitySummary } from "@/components/AssessmentAbilitySummary";

type Detail = {
  id: number;
  childName: string;
  semester: string;
  courseName: string;
  scores: string;
  comment: string;
  title: string;
  date: string;
  school: string;
  teacherName: string;
};

type ListRow = Pick<Detail, "id" | "childName" | "courseName" | "school" | "date">;

function Radar({ scores }: { scores: string }) {
  const groups = groupAverages(parseScores(scores));
  const center = 150;
  const maxRadius = 95;
  const points = groups.map((group, index) => {
    const angle = -Math.PI / 2 + (index * Math.PI * 2) / groups.length;
    const radius = (group.value / 5) * maxRadius;
    return {
      ...group,
      x: center + Math.cos(angle) * radius,
      y: center + Math.sin(angle) * radius,
      lx: center + Math.cos(angle) * 125,
      ly: center + Math.sin(angle) * 125,
    };
  });
  const polygon = points.map((point) => `${point.x},${point.y}`).join(" ");
  return (
    <svg viewBox="0 0 300 300" className="mx-auto h-[62mm] w-[62mm]">
      {[1, 2, 3, 4, 5].map((level) => {
        const radius = (level / 5) * maxRadius;
        const ring = groups.map((_group, index) => {
          const angle = -Math.PI / 2 + (index * Math.PI * 2) / groups.length;
          return `${center + Math.cos(angle) * radius},${center + Math.sin(angle) * radius}`;
        }).join(" ");
        return <polygon key={level} points={ring} fill="none" stroke="#D9C8A8" strokeDasharray="4 4" />;
      })}
      {groups.map((_group, index) => {
        const angle = -Math.PI / 2 + (index * Math.PI * 2) / groups.length;
        return <line key={index} x1={center} y1={center} x2={center + Math.cos(angle) * maxRadius} y2={center + Math.sin(angle) * maxRadius} stroke="#D9C8A8" />;
      })}
      <polygon points={polygon} fill="#D9C08C" opacity="0.55" stroke="#B68A4C" strokeWidth="3" />
      {points.map((point) => (
        <g key={point.label}>
          <circle cx={point.x} cy={point.y} r="4" fill="#B68A4C" />
          <text x={point.lx} y={point.ly} textAnchor="middle" dominantBaseline="middle" fontSize="13" fontWeight="700" fill="#1f2937">
            {point.label} {point.value}
          </text>
        </g>
      ))}
    </svg>
  );
}

export default function CertificatePage() {
  const params = useParams<{ id: string }>();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [rows, setRows] = useState<ListRow[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    fetch(`/api/assessments/${params.id}`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "讀取證書失敗");
        return data;
      })
      .then(setDetail)
      .catch((e) => setError((e as Error).message || "讀取證書失敗"));
    fetch("/api/assessments").then((res) => res.json()).then(setRows).catch(() => setRows([]));
  }, [params.id]);

  const dateText = useMemo(() => {
    if (!detail) return "";
    return new Date(detail.date).toLocaleDateString("zh-TW", { year: "numeric", month: "long", day: "numeric" });
  }, [detail]);
  const compactComment = useMemo(() => {
    if (!detail) return "";
    const text = detail.comment.replace(/\s+/g, " ").trim();
    return text.length > 150 ? `${text.slice(0, 150)}...` : text;
  }, [detail]);

  if (error) return <div className="py-16 text-center text-red-500">{error}</div>;
  if (!detail) return <div className="py-16 text-center text-slate-400">載入成果證書中...</div>;

  return (
    <div className="mx-auto max-w-5xl">
      <style jsx global>{`
        .certificate-print-root, .certificate-print-root * {
          print-color-adjust: exact;
          -webkit-print-color-adjust: exact;
        }
        @page {
          size: A4;
          margin: 0;
        }
        @media print {
          html, body {
            width: 210mm;
            height: 297mm;
            margin: 0 !important;
            background: white !important;
            overflow: hidden !important;
          }
          header, footer, .no-print { display: none !important; }
          main {
            max-width: none !important;
            padding: 0 !important;
            margin: 0 !important;
          }
          .certificate-sheet {
            box-shadow: none !important;
            border-radius: 0 !important;
            margin: 0 !important;
            width: 210mm !important;
            height: 297mm !important;
            max-height: 297mm !important;
            overflow: hidden !important;
          }
        }
      `}</style>
      <div className="no-print mb-4 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => history.back()} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700">
            返回上一頁
          </button>
          <select value={detail.id} onChange={(e) => { location.href = `/assessments/${e.target.value}/certificate`; }}
            className="min-w-64 rounded-lg border border-slate-200 px-3 py-2 text-sm">
            {rows.map((row) => (
              <option key={row.id} value={row.id}>{row.childName}｜{row.school}｜{row.courseName}</option>
            ))}
          </select>
          <button onClick={() => window.print()} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white">
            下載 PDF
          </button>
          <button onClick={() => window.print()} className="rounded-lg bg-[#B68A4C] px-4 py-2 text-sm font-semibold text-white">
            列印
          </button>
          <button onClick={() => alert("AI 評語會依目前評分自動產生；若要重算，請重新送出該孩子評量。")}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700">
            重新產生 AI 評語
          </button>
        </div>
      </div>
      <article className="certificate-print-root certificate-sheet mx-auto h-[297mm] w-[210mm] overflow-hidden bg-white p-[6mm] shadow-sm">
        <div className="flex h-[45mm] items-center gap-[12mm] bg-[#0756B7] px-[9mm] text-white">
          <img src="/upbear-logo.png" alt="優比熊 Logo" className="h-[36mm] w-[36mm] shrink-0 object-contain" />
          <div>
            <div className="text-[9pt] font-semibold tracking-[0.25em] text-blue-100">WAYSLEADER AI LEARNING OUTCOME REPORT</div>
            <h1 className="mt-[3mm] text-[27pt] font-black tracking-wide">專業運動素養發展報告</h1>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-[5mm] px-[8mm] py-[5mm] text-[13pt] font-black">
          <div className="rounded-2xl bg-[#F5F8FF] px-[4mm] py-[3mm]">孩子姓名<br /><span className="text-[18pt] text-[#0756B7]">{detail.childName}</span></div>
          <div className="rounded-2xl bg-[#F8F3E8] px-[4mm] py-[3mm]">課程名稱<br /><span className="text-[18pt] text-[#0756B7]">{detail.courseName}</span></div>
          <div className="rounded-2xl bg-[#F5F8FF] px-[4mm] py-[3mm]">園所名稱<br /><span className="text-[16pt] text-[#0756B7]">{detail.school}</span></div>
        </div>

        <section className="px-[8mm]">
          <div className="flex items-center justify-between">
            <h2 className="text-[21pt] font-black">三大核心發展指標</h2>
            <div className="rounded-full bg-[#F3E7D0] px-[5mm] py-[2mm] text-[12pt] font-black text-[#6E4C1E]">{detail.title}</div>
          </div>
          <div className="-mt-[7mm]">
            <Radar scores={detail.scores} />
          </div>
        </section>

        <div className="mt-[-1mm]">
          <AssessmentAbilitySummary scores={detail.scores} />
        </div>

        <section className="mt-[4mm] px-[8mm]">
          <div className="inline-block rounded-t-2xl bg-[#0756B7] px-[6mm] py-[2.5mm] text-[15pt] font-bold text-white">教練專業觀察與建議</div>
          <div className="h-[38mm] overflow-hidden rounded-b-[22px] rounded-tr-[22px] bg-[#E8D9BC] px-[8mm] py-[4mm] text-[11.5pt] leading-[1.52] text-slate-800">
            {compactComment}
          </div>
        </section>

        <div className="mt-[5mm] flex items-end justify-between px-[8mm] text-[10pt] text-slate-500">
          <div>
            <div>園所：{detail.school}</div>
            <div>授課老師：{detail.teacherName}</div>
            <div>日期：{dateText}</div>
          </div>
          <div className="text-[22pt] font-black text-[#0756B7]">WaysLeader AI</div>
        </div>
      </article>
    </div>
  );
}
