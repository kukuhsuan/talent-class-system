"use client";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { groupAverages, parseScores } from "@/lib/kindergartenAssessment";
import { AssessmentAbilitySummary } from "@/components/AssessmentAbilitySummary";

type Detail = {
  id: number; childName: string; courseName: string; school: string; teacherName: string;
  date: string; scores: string; comment: string; title: string;
};

function Radar({ scores }: { scores: string }) {
  const groups = groupAverages(parseScores(scores));
  const center = 150;
  const maxRadius = 92;
  const points = groups.map((group, index) => {
    const angle = -Math.PI / 2 + (index * Math.PI * 2) / groups.length;
    const radius = (group.value / 5) * maxRadius;
    return {
      ...group,
      x: center + Math.cos(angle) * radius,
      y: center + Math.sin(angle) * radius,
      lx: center + Math.cos(angle) * 124,
      ly: center + Math.sin(angle) * 124,
    };
  });
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
      <polygon points={points.map((point) => `${point.x},${point.y}`).join(" ")} fill="#D9C08C" opacity="0.55" stroke="#B68A4C" strokeWidth="3" />
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

export default function SchoolPortalCertificatePage() {
  const params = useParams<{ token: string; id: string }>();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/school-portal/${encodeURIComponent(params.token)}/certificate/${params.id}`)
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || "讀取證書失敗");
        return body;
      })
      .then(setDetail)
      .catch((e) => setError((e as Error).message || "讀取證書失敗"));
  }, [params.id, params.token]);

  const compactComment = useMemo(() => {
    if (!detail) return "";
    const text = detail.comment.replace(/\s+/g, " ").trim();
    return text.length > 150 ? `${text.slice(0, 150)}...` : text;
  }, [detail]);

  if (error) return <div className="min-h-screen bg-slate-50 py-16 text-center text-red-500">{error}</div>;
  if (!detail) return <div className="min-h-screen bg-slate-50 py-16 text-center text-slate-400">載入證書中...</div>;

  return (
    <div className="min-h-screen bg-slate-100 py-4">
      <style jsx global>{`
        .certificate-print-root, .certificate-print-root * {
          print-color-adjust: exact;
          -webkit-print-color-adjust: exact;
        }
        @page { size: A4; margin: 0; }
        @media print {
          html, body { width: 210mm; height: 297mm; margin: 0 !important; background: white !important; overflow: hidden !important; }
          .no-print { display: none !important; }
          .certificate-sheet { box-shadow: none !important; margin: 0 !important; width: 210mm !important; height: 297mm !important; overflow: hidden !important; }
        }
      `}</style>
      <div className="no-print mx-auto mb-3 flex max-w-4xl flex-wrap gap-2 px-4">
        <button onClick={() => history.back()} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700">返回上一頁</button>
        <button onClick={() => window.print()} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white">下載 PDF / 列印</button>
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
          <div className="-mt-[7mm]"><Radar scores={detail.scores} /></div>
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
            <div>日期：{new Date(detail.date).toLocaleDateString("zh-TW", { year: "numeric", month: "long", day: "numeric" })}</div>
          </div>
          <div className="text-[22pt] font-black text-[#0756B7]">WaysLeader AI</div>
        </div>
      </article>
    </div>
  );
}
