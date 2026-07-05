export const CORE_ABILITIES = [
  "專注力",
  "團隊合作",
  "自信心",
  "反應力",
  "手眼協調",
  "肢體協調",
  "表達力",
  "判斷力",
] as const;

export type CoreAbility = (typeof CORE_ABILITIES)[number];

export const ABILITY_ICON_MAP: Record<CoreAbility, string> = {
  專注力: "/images/abilities/focus-bear.png",
  團隊合作: "/images/abilities/teamwork-bear.png",
  自信心: "/images/abilities/confidence-bear.png",
  反應力: "/images/abilities/reaction-bear.png",
  手眼協調: "/images/abilities/hand-eye-bear.png",
  肢體協調: "/images/abilities/body-coordination-bear.png",
  表達力: "/images/abilities/expression-bear.png",
  判斷力: "/images/abilities/judgement-bear.png",
};

const ABILITY_ALIASES: Record<string, CoreAbility> = {
  專注: "專注力",
  專注力: "專注力",
  專注觀察: "專注力",
  觀察力: "專注力",
  團隊合作: "團隊合作",
  團隊互動: "團隊合作",
  合作: "團隊合作",
  協調: "團隊合作",
  競賽合作: "團隊合作",
  輪流等待: "團隊合作",
  自信: "自信心",
  自信心: "自信心",
  自信心建立: "自信心",
  自信表現: "自信心",
  情緒控制: "自信心",
  反應: "反應力",
  反應力: "反應力",
  反應能力: "反應力",
  反應速度: "反應力",
  專注反應: "反應力",
  對抗反應: "反應力",
  敏捷速度: "反應力",
  敏捷性: "反應力",
  敏捷移動: "反應力",
  手眼協調: "手眼協調",
  手部協調: "手眼協調",
  手部控制: "手眼協調",
  控球穩定: "手眼協調",
  腳部控制: "肢體協調",
  腳步協調: "肢體協調",
  協調能力: "肢體協調",
  肢體協調: "肢體協調",
  身體協調: "肢體協調",
  肢體控制: "肢體協調",
  身體控制: "肢體協調",
  動作控制: "肢體協調",
  平衡能力: "肢體協調",
  平衡感: "肢體協調",
  肌肉發展: "肢體協調",
  表達: "表達力",
  表達力: "表達力",
  溝通: "表達力",
  溝通能力: "表達力",
  節奏感: "表達力",
  判斷: "判斷力",
  判斷力: "判斷力",
  判斷能力: "判斷力",
  規則理解: "判斷力",
  策略思考: "判斷力",
};

export function normalizeAbility(value: string | null | undefined): CoreAbility | null {
  const cleaned = String(value ?? "")
    .replace(/^能力重點[:：]\s*/, "")
    .trim();
  return ABILITY_ALIASES[cleaned] ?? null;
}

export function normalizeAbilities(values: Iterable<string>, limit = 6): CoreAbility[] {
  const normalized: CoreAbility[] = [];
  for (const value of values) {
    const ability = normalizeAbility(value);
    if (ability && !normalized.includes(ability)) normalized.push(ability);
    if (normalized.length >= limit) break;
  }
  return normalized;
}

export function parseAbilities(value: string | null | undefined, limit = 6): CoreAbility[] {
  const raw = String(value ?? "").trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return normalizeAbilities(parsed.map(String), limit);
  } catch {
    // Older records are plain text.
  }
  return normalizeAbilities(raw.split(/[、,，\n]/), limit);
}
