"use client";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { groupAverages, parseScores } from "@/lib/kindergartenAssessment";

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

const BEAR_LOGO = `data:image/svg+xml;utf8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 220">
  <defs>
    <radialGradient id="gold" cx="50%" cy="40%" r="65%">
      <stop offset="0%" stop-color="#fff2c8"/>
      <stop offset="55%" stop-color="#c79a48"/>
      <stop offset="100%" stop-color="#60421f"/>
    </radialGradient>
    <radialGradient id="fur" cx="50%" cy="38%" r="60%">
      <stop offset="0%" stop-color="#f6c999"/>
      <stop offset="100%" stop-color="#8a552d"/>
    </radialGradient>
  </defs>
  <circle cx="110" cy="110" r="104" fill="url(#gold)"/>
  <circle cx="110" cy="110" r="91" fill="#ead6aa" stroke="#6e4c1e" stroke-width="5"/>
  <circle cx="72" cy="77" r="27" fill="#8a552d"/><circle cx="148" cy="77" r="27" fill="#8a552d"/>
  <circle cx="72" cy="77" r="15" fill="#f0c9a1"/><circle cx="148" cy="77" r="15" fill="#f0c9a1"/>
  <circle cx="110" cy="112" r="58" fill="url(#fur)"/>
  <circle cx="88" cy="105" r="8" fill="#1f2937"/><circle cx="132" cy="105" r="8" fill="#1f2937"/>
  <circle cx="110" cy="124" r="11" fill="#2e2016"/>
  <path d="M90 143c12 13 28 13 40 0" fill="none" stroke="#2e2016" stroke-width="6" stroke-linecap="round"/>
  <path d="M48 170c37 23 87 23 124 0" fill="none" stroke="#6e4c1e" stroke-width="7" stroke-linecap="round"/>
  <text x="110" y="196" font-family="Arial, sans-serif" font-size="18" font-weight="800" text-anchor="middle" fill="#60421f">UPBEAR</text>
</svg>
`)}`;

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
    <svg viewBox="0 0 300 300" className="mx-auto h-[60mm] w-[60mm]">
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
      <div className="no-print mb-4 flex justify-end gap-2">
        <button onClick={() => window.print()} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white">
          下載 / 列印 PDF
        </button>
      </div>
      <article className="certificate-print-root certificate-sheet mx-auto h-[297mm] w-[210mm] overflow-hidden bg-white p-[8mm] shadow-sm">
        <div className="flex h-[47mm] items-center gap-[12mm] bg-[#0756B7] px-[9mm] text-white">
          <img src={BEAR_LOGO} alt="優比熊 Logo" className="h-[34mm] w-[34mm] shrink-0" />
          <div>
            <div className="text-[9pt] font-semibold tracking-[0.25em] text-blue-100">PROFESSIONAL ATHLETIC GROWTH REPORT</div>
            <h1 className="mt-[3mm] text-[27pt] font-black tracking-wide">專業運動素養發展報告</h1>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-[7mm] px-[8mm] py-[8mm] text-[18pt] font-black">
          <div>孩子姓名：<span className="text-[#0756B7]">{detail.childName}</span></div>
          <div>課程名稱：<span className="text-[#0756B7]">{detail.courseName}</span></div>
        </div>

        <section className="px-[8mm]">
          <div className="flex items-center justify-between">
            <h2 className="text-[21pt] font-black">三大核心發展指標</h2>
            <div className="rounded-full bg-[#F3E7D0] px-[5mm] py-[2mm] text-[12pt] font-black text-[#6E4C1E]">{detail.title}</div>
          </div>
          <Radar scores={detail.scores} />
        </section>

        <section className="mt-[4mm] px-[8mm]">
          <div className="inline-block rounded-t-2xl bg-[#0756B7] px-[6mm] py-[3mm] text-[16pt] font-bold text-white">教練專業觀察與建議</div>
          <div className="h-[48mm] overflow-hidden rounded-b-[28px] rounded-tr-[28px] bg-[#E8D9BC] px-[8mm] py-[6mm] text-[15pt] leading-[1.75] text-slate-800">
            {compactComment}
          </div>
        </section>

        <div className="mt-[7mm] flex items-end justify-between px-[8mm] text-[10pt] text-slate-500">
          <div>
            <div>園所：{detail.school}</div>
            <div>授課老師：{detail.teacherName}</div>
            <div>日期：{dateText}</div>
          </div>
          <div className="text-[24pt] italic text-[#6E4C1E]">*Ways Leader.</div>
        </div>
      </article>
    </div>
  );
}
