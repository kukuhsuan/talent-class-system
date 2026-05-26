"use client";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { groupAverages, parseScores } from "@/lib/kindergartenAssessment";

type Detail = {
  id: number;
  childName: string;
  courseName: string;
  scores: string;
  comment: string;
  title: string;
  date: string;
  school: string;
  teacherName: string;
};

function Radar({ scores }: { scores: string }) {
  const groups = groupAverages(parseScores(scores));
  const center = 150;
  const maxRadius = 90;
  const points = groups.map((group, index) => {
    const angle = -Math.PI / 2 + (index * Math.PI * 2) / groups.length;
    const radius = (group.value / 5) * maxRadius;
    return {
      ...group,
      x: center + Math.cos(angle) * radius,
      y: center + Math.sin(angle) * radius,
      lx: center + Math.cos(angle) * 122,
      ly: center + Math.sin(angle) * 122,
    };
  });
  const polygon = points.map((point) => `${point.x},${point.y}`).join(" ");
  return (
    <svg viewBox="0 0 300 300" className="mx-auto h-[78mm] w-[78mm]">
      {[1, 2, 3, 4, 5].map((level) => {
        const radius = (level / 5) * maxRadius;
        const ring = groups.map((_group, index) => {
          const angle = -Math.PI / 2 + (index * Math.PI * 2) / groups.length;
          return `${center + Math.cos(angle) * radius},${center + Math.sin(angle) * radius}`;
        }).join(" ");
        return <polygon key={level} points={ring} fill="none" stroke="#D9C8A8" strokeDasharray="4 4" />;
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

function Sheet({ detail }: { detail: Detail }) {
  const dateText = new Date(detail.date).toLocaleDateString("zh-TW", { year: "numeric", month: "long", day: "numeric" });
  const comment = detail.comment.replace(/\s+/g, " ").trim();
  const compact = comment.length > 132 ? `${comment.slice(0, 132)}...` : comment;
  return (
    <article className="certificate-sheet mx-auto mb-6 h-[297mm] w-[210mm] overflow-hidden bg-white p-[6mm] shadow-sm">
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
        <div className="-mt-[4mm]"><Radar scores={detail.scores} /></div>
      </section>
      <section className="mt-[-3mm] px-[8mm]">
        <div className="inline-block rounded-t-2xl bg-[#0756B7] px-[6mm] py-[2.5mm] text-[15pt] font-bold text-white">教練專業觀察與建議</div>
        <div className="h-[42mm] overflow-hidden rounded-b-[26px] rounded-tr-[26px] bg-[#E8D9BC] px-[8mm] py-[5mm] text-[14pt] leading-[1.72] text-slate-800">{compact}</div>
      </section>
      <div className="mt-[5mm] flex items-end justify-between px-[8mm] text-[10pt] text-slate-500">
        <div><div>園所：{detail.school}</div><div>授課老師：{detail.teacherName}</div><div>日期：{dateText}</div></div>
        <div className="text-[22pt] font-black text-[#0756B7]">WaysLeader AI</div>
      </div>
    </article>
  );
}

function BatchCertificatesContent() {
  const params = useSearchParams();
  const ids = useMemo(() => (params.get("ids") ?? "").split(",").map((id) => Number(id)).filter(Boolean), [params]);
  const [rows, setRows] = useState<Detail[]>([]);

  useEffect(() => {
    Promise.all(ids.map((id) => fetch(`/api/assessments/${id}`).then((res) => res.json())))
      .then((items) => setRows(items.filter((item) => item?.id)))
      .catch(() => setRows([]));
  }, [ids]);

  return (
    <div>
      <style jsx global>{`
        .certificate-sheet, .certificate-sheet * { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
        @page { size: A4; margin: 0; }
        @media print {
          header, footer, .no-print { display: none !important; }
          main { max-width: none !important; padding: 0 !important; margin: 0 !important; }
          body { background: white !important; }
          .certificate-sheet { box-shadow: none !important; margin: 0 !important; page-break-after: always; break-after: page; }
          .certificate-sheet:last-child { page-break-after: auto; break-after: auto; }
        }
      `}</style>
      <div className="no-print mb-4 flex justify-end gap-2">
        <button onClick={() => history.back()} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700">返回</button>
        <button onClick={() => window.print()} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white">批次下載 / 列印 PDF</button>
      </div>
      {rows.map((row) => <Sheet key={row.id} detail={row} />)}
      {rows.length === 0 && <div className="py-12 text-center text-slate-400">尚無可列印的評量</div>}
    </div>
  );
}

export default function BatchCertificatesPage() {
  return (
    <Suspense fallback={<div className="py-12 text-center text-slate-400">載入批次證書中...</div>}>
      <BatchCertificatesContent />
    </Suspense>
  );
}
