export const COURSE_OPTIONS = [
  { code: "FT", label: "足球" },
  { code: "P", label: "體能" },
  { code: "G", label: "高爾夫" },
  { code: "BK", label: "籃球" },
  { code: "B", label: "棒球" },
  { code: "D", label: "舞蹈" },
  { code: "冰壺", label: "冰壺" },
  { code: "正音", label: "正音" },
] as const;

export const COURSE_LABEL: Record<string, string> = {
  FT: "足球",
  ft: "足球",
  P: "體能",
  p: "體能",
  G: "高爾夫",
  g: "高爾夫",
  BK: "籃球",
  bk: "籃球",
  B: "棒球",
  b: "棒球",
  D: "舞蹈",
  d: "舞蹈",
  冰壺: "冰壺",
  正音: "正音",
};

export function courseLabel(code: string | null | undefined): string {
  if (!code) return "";
  const trimmed = code.trim();
  return COURSE_LABEL[trimmed] ?? COURSE_LABEL[trimmed.toUpperCase()] ?? trimmed;
}

export const REGION_OPTIONS = ["台北區", "桃園區", "新竹區", "台中區", "彰化區", "台南區", "高雄區"] as const;

const REGION_ALIASES: Record<string, string> = {
  台北: "台北區",
  台北市: "台北區",
  新北: "台北區",
  新北市: "台北區",
  桃園: "桃園區",
  桃園市: "桃園區",
  新竹: "新竹區",
  新竹市: "新竹區",
  新竹縣: "新竹區",
  台中: "台中區",
  台中市: "台中區",
  彰化: "彰化區",
  彰化縣: "彰化區",
  台南: "台南區",
  台南市: "台南區",
  高雄: "高雄區",
  高雄市: "高雄區",
};

export function normalizeRegion(region: string | null | undefined): string {
  const trimmed = (region ?? "").trim();
  if (!trimmed) return "";
  return REGION_ALIASES[trimmed] ?? trimmed;
}

export function regionQueryValues(region: string | null | undefined): string[] {
  const normalized = normalizeRegion(region);
  if (!normalized) return [];
  const legacy = normalized.endsWith("區") ? normalized.slice(0, -1) : "";
  return [...new Set([normalized, legacy].filter(Boolean))];
}

export const DEPARTMENT_OPTIONS = ["幼兒園", "國小", "安親班"] as const;
export type DepartmentOption = (typeof DEPARTMENT_OPTIONS)[number];

export function normalizeDepartment(department: string | null | undefined): DepartmentOption {
  const trimmed = (department ?? "").trim();
  if (trimmed === "安親") return "安親班";
  if (trimmed === "國小" || trimmed === "安親班" || trimmed === "幼兒園") return trimmed;
  return "幼兒園";
}

export function departmentMatches(value: string | null | undefined, selected: string): boolean {
  if (!selected) return true;
  return normalizeDepartment(value) === normalizeDepartment(selected);
}

export function departmentQueryValues(department: string | null | undefined): string[] {
  const normalized = normalizeDepartment(department);
  if (normalized === "安親班") return ["安親班", "安親"];
  return [normalized];
}
