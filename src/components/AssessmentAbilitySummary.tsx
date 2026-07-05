import { ASSESSMENT_GROUPS, parseScores, strongestItems } from "@/lib/kindergartenAssessment";

const HIGHLIGHT_TEXT: Record<string, string> = {
  爆發力: "爆發力穩定發展",
  協調性: "協調性逐步提升",
  平衡感: "平衡感表現穩定",
  敏捷性: "敏捷性反應良好",
  專注力: "專注力表現良好",
  規則理解: "規則理解清楚",
  指令反應: "指令反應穩定",
  團隊合作: "團隊互動自然",
  自信表現: "自信心持續累積",
  情緒控制: "情緒調節穩定",
};

function scoreBarWidth(score: number) {
  return `${Math.max(20, Math.min(100, (score / 5) * 100))}%`;
}

export function AssessmentAbilitySummary({ scores }: { scores: string }) {
  const parsedScores = parseScores(scores);
  const highlights = strongestItems(parsedScores, 5);

  return (
    <section className="px-[8mm]">
      <div>
        <div className="mb-[2mm] text-[11pt] font-black text-slate-800">本期能力亮點</div>
        <div className="flex flex-wrap gap-[2mm]">
          {highlights.map((item) => (
            <span key={item} className="rounded-full border border-[#E4D3B1] bg-[#FBF7EF] px-[3mm] py-[1.2mm] text-[9.2pt] font-bold text-[#6E4C1E]">
              {HIGHLIGHT_TEXT[item] ?? item}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-[3mm] grid grid-cols-3 gap-[3mm]">
        {ASSESSMENT_GROUPS.map((group) => (
          <div key={group.title} className="rounded-xl border border-slate-200 bg-white px-[3mm] py-[2.5mm]">
            <div className="mb-[1.5mm] text-[10.5pt] font-black text-[#0756B7]">{group.title}</div>
            <div className="space-y-[1.4mm]">
              {group.items.map((item) => {
                const score = parsedScores[item] ?? 3;
                return (
                  <div key={item}>
                    <div className="mb-[0.8mm] flex items-center justify-between text-[8.8pt] font-semibold text-slate-700">
                      <span>{item}</span>
                      <span className="text-[#6E4C1E]">{score} 分</span>
                    </div>
                    <div className="h-[1.5mm] overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-[#D9C08C]" style={{ width: scoreBarWidth(score) }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
