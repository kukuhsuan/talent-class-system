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
    <svg viewBox="0 0 300 300" className="mx-auto h-72 w-72">
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

  if (error) return <div className="py-16 text-center text-red-500">{error}</div>;
  if (!detail) return <div className="py-16 text-center text-slate-400">載入成果證書中...</div>;

  return (
    <div className="mx-auto max-w-5xl">
      <style jsx global>{`
        @media print {
          header, .no-print { display: none !important; }
          body { background: white !important; }
          .certificate-sheet { box-shadow: none !important; margin: 0 !important; width: 100% !important; }
        }
      `}</style>
      <div className="no-print mb-4 flex justify-end gap-2">
        <button onClick={() => window.print()} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white">
          下載 / 列印 PDF
        </button>
      </div>
      <article className="certificate-sheet rounded-2xl bg-white p-8 shadow-sm">
        <div className="flex items-center gap-8 bg-[#0756B7] px-8 py-8 text-white">
          <div className="flex h-32 w-32 items-center justify-center rounded-full border-4 border-[#C7A66A] bg-[#F3E7D0] text-center text-xl font-black text-[#6E4C1E]">
            UP<br />BEAR
          </div>
          <div>
            <div className="text-sm font-semibold tracking-[0.25em] text-blue-100">PROFESSIONAL ATHLETIC GROWTH REPORT</div>
            <h1 className="mt-2 text-4xl font-black tracking-wide">專業運動素養發展報告</h1>
          </div>
        </div>

        <div className="grid gap-6 px-6 py-8 text-2xl font-black md:grid-cols-2">
          <div>孩子姓名：<span className="text-[#0756B7]">{detail.childName}</span></div>
          <div>課程名稱：<span className="text-[#0756B7]">{detail.courseName}</span></div>
          <div>學期名稱：<span className="text-[#0756B7]">{detail.semester}</span></div>
          <div>成長稱號：<span className="text-[#B68A4C]">{detail.title}</span></div>
        </div>

        <section className="px-6">
          <h2 className="mb-4 text-3xl font-black">三大核心發展指標</h2>
          <Radar scores={detail.scores} />
        </section>

        <section className="mt-8 px-6">
          <div className="inline-block rounded-t-2xl bg-[#0756B7] px-6 py-3 text-xl font-bold text-white">教練專業觀察與建議</div>
          <div className="rounded-b-[36px] rounded-tr-[36px] bg-[#E8D9BC] p-6 text-lg leading-9 text-slate-800">
            {detail.comment}
          </div>
        </section>

        <div className="mt-10 flex items-end justify-between px-6 text-sm text-slate-500">
          <div>
            <div>園所：{detail.school}</div>
            <div>授課老師：{detail.teacherName}</div>
            <div>日期：{dateText}</div>
          </div>
          <div className="text-3xl italic text-[#6E4C1E]">*Ways Leader.</div>
        </div>
      </article>
    </div>
  );
}
