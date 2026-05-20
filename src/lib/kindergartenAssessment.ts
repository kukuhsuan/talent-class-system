export const ASSESSMENT_GROUPS = [
  { title: "身體能力", items: ["爆發力", "協調性", "平衡感", "敏捷性"] },
  { title: "學習能力", items: ["專注力", "規則理解", "指令反應"] },
  { title: "團隊能力", items: ["團隊合作", "自信表現", "情緒控制"] },
] as const;

export const ASSESSMENT_ITEMS = ASSESSMENT_GROUPS.flatMap((group) => group.items);

export type AssessmentScores = Record<string, number>;

export function emptyScores(): AssessmentScores {
  return Object.fromEntries(ASSESSMENT_ITEMS.map((item) => [item, 3]));
}

export function normalizeScores(value: unknown): AssessmentScores {
  const base = emptyScores();
  if (!value || typeof value !== "object") return base;
  for (const item of ASSESSMENT_ITEMS) {
    const n = Number((value as Record<string, unknown>)[item]);
    base[item] = Number.isFinite(n) ? Math.min(5, Math.max(1, Math.round(n))) : 3;
  }
  return base;
}

export function scoreAverage(scores: AssessmentScores) {
  const values = ASSESSMENT_ITEMS.map((item) => scores[item] ?? 3);
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function strongestItems(scores: AssessmentScores, count = 2) {
  return [...ASSESSMENT_ITEMS]
    .sort((a, b) => (scores[b] ?? 0) - (scores[a] ?? 0))
    .slice(0, count);
}

export function growthTitle(scores: AssessmentScores) {
  const strongest = strongestItems(scores, 1)[0];
  if (strongest === "專注力") return "專注力小達人";
  if (strongest === "團隊合作") return "團隊合作小明星";
  if (["爆發力", "敏捷性", "協調性", "平衡感"].includes(strongest)) return "小小運動健將";
  if (strongest === "自信表現") return "自信閃亮小明星";
  if (strongest === "規則理解") return "規則理解小高手";
  return "優比熊運動小健將";
}

export function generateGrowthComment(childName: string, courseName: string, scores: AssessmentScores) {
  const avg = scoreAverage(scores);
  const [first, second] = strongestItems(scores, 2);
  const name = childName.trim() || "孩子";
  const course = courseName.trim() || "才藝課程";
  const opening = avg >= 4.3
    ? `${name}在本學期${course}中展現穩定且亮眼的參與表現。`
    : avg >= 3.2
      ? `${name}在本學期${course}中能跟著老師完成多數活動，整體發展符合年齡期待。`
      : `${name}在本學期${course}中持續累積經驗，透過老師引導逐步建立參與信心。`;
  return `${opening}其中以「${first}」與「${second}」表現最明顯，能在遊戲化練習中累積身體控制與課堂規則經驗。後續建議持續透過穩定的活動節奏與正向鼓勵，讓孩子在運動能力、學習態度與團隊互動上更自然地成長。`;
}

export function groupAverages(scores: AssessmentScores) {
  return ASSESSMENT_GROUPS.map((group) => {
    const values = group.items.map((item) => scores[item] ?? 3);
    return {
      label: group.title,
      value: Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1)),
    };
  });
}

export function parseScores(raw: string | null | undefined) {
  if (!raw) return emptyScores();
  try {
    return normalizeScores(JSON.parse(raw));
  } catch {
    return emptyScores();
  }
}

export function assessmentSemester(dateValue: string | Date) {
  const date = new Date(dateValue);
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  if (month >= 3 && month <= 6) return `${year}春季學期`;
  if (month >= 9 || month === 1) return `${month === 1 ? year - 1 : year}秋季學期`;
  return `${year}學期`;
}
