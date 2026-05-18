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

export const CATEGORY_OPTIONS = ["課內", "課後", "Demo", "營隊"] as const;
export type CategoryOption = (typeof CATEGORY_OPTIONS)[number];

const CATEGORY_ALIASES: Record<string, CategoryOption> = {
  課內: "課內",
  課後: "課後",
  Demo: "Demo",
  demo: "Demo",
  DEMO: "Demo",
  課後班: "課後",
  體驗課: "Demo",
  試上: "Demo",
  夏令營: "營隊",
  冬令營: "營隊",
  營隊: "營隊",
};

export function normalizeCategory(category: string | null | undefined): CategoryOption {
  const trimmed = (category ?? "").trim();
  if (!trimmed) return "課後";
  return CATEGORY_ALIASES[trimmed] ?? "課後";
}

export const CATEGORY_BADGE_CLASS: Record<CategoryOption, string> = {
  課內: "bg-green-100 text-green-700 border border-green-200",
  課後: "bg-blue-100 text-blue-700 border border-blue-200",
  Demo: "bg-orange-100 text-orange-700 border border-orange-200",
  營隊: "bg-purple-100 text-purple-700 border border-purple-200",
};

/** 台灣縣市（直轄市、縣、市）標準選項，供表單與篩選使用 */
export const REGION_OPTIONS = [
  "台北市",
  "新北市",
  "桃園市",
  "新竹市",
  "新竹縣",
  "台中市",
  "彰化縣",
  "南投縣",
  "雲林縣",
  "嘉義市",
  "嘉義縣",
  "台南市",
  "高雄市",
  "屏東縣",
  "宜蘭縣",
  "花蓮縣",
  "台東縣",
  "基隆市",
  "苗栗縣",
  "澎湖縣",
] as const;

export type RegionOption = (typeof REGION_OPTIONS)[number];

const REGION_ALIASES: Record<string, RegionOption> = {
  台北: "台北市",
  台北市: "台北市",
  臺北: "台北市",
  臺北市: "台北市",
  台北區: "台北市",
  新北: "新北市",
  新北市: "新北市",
  桃園: "桃園市",
  桃園市: "桃園市",
  桃園區: "桃園市",
  新竹: "新竹市",
  新竹市: "新竹市",
  新竹區: "新竹市",
  新竹縣: "新竹縣",
  台中: "台中市",
  台中市: "台中市",
  臺中: "台中市",
  臺中市: "台中市",
  台中區: "台中市",
  彰化: "彰化縣",
  彰化縣: "彰化縣",
  彰化區: "彰化縣",
  南投: "南投縣",
  南投縣: "南投縣",
  雲林: "雲林縣",
  雲林縣: "雲林縣",
  嘉義: "嘉義市",
  嘉義市: "嘉義市",
  嘉義縣: "嘉義縣",
  台南: "台南市",
  台南市: "台南市",
  臺南: "台南市",
  臺南市: "台南市",
  台南區: "台南市",
  高雄: "高雄市",
  高雄市: "高雄市",
  高雄區: "高雄市",
  屏東: "屏東縣",
  屏東縣: "屏東縣",
  宜蘭: "宜蘭縣",
  宜蘭縣: "宜蘭縣",
  花蓮: "花蓮縣",
  花蓮縣: "花蓮縣",
  台東: "台東縣",
  台東縣: "台東縣",
  臺東: "台東縣",
  臺東縣: "台東縣",
  基隆: "基隆市",
  基隆市: "基隆市",
  苗栗: "苗栗縣",
  苗栗縣: "苗栗縣",
  澎湖: "澎湖縣",
  澎湖縣: "澎湖縣",
};

export function normalizeRegion(region: string | null | undefined): string {
  const trimmed = (region ?? "").trim();
  if (!trimmed) return "";
  const aliased = REGION_ALIASES[trimmed];
  if (aliased) return aliased;
  if ((REGION_OPTIONS as readonly string[]).includes(trimmed)) return trimmed;
  return trimmed;
}

/** 查詢／篩選時比對資料庫中可能存在的舊值與別名 */
export function regionQueryValues(region: string | null | undefined): string[] {
  const normalized = normalizeRegion(region);
  if (!normalized) return [];
  const legacyKeys = Object.entries(REGION_ALIASES)
    .filter(([, canonical]) => canonical === normalized)
    .map(([alias]) => alias);
  return [...new Set([normalized, ...legacyKeys])];
}

export function regionMatchesFilter(stored: string | null | undefined, filter: string): boolean {
  if (!filter) return true;
  const storedNorm = normalizeRegion(stored);
  const filterNorm = normalizeRegion(filter);
  if (!storedNorm || !filterNorm) return false;
  return storedNorm === filterNorm;
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
