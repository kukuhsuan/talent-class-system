import { prisma } from "@/lib/prisma";

// 通用設定表：目前放文件範本下載連結。
// 規格要求「連結不可寫死在程式裡，管理者可隨時更換」。
export const APP_SETTING_KEYS = {
  mandateTemplateUrl: "doc.template.mandate.url",
  bankbookHint: "doc.template.bankbook.hint",
  documentRetentionDays: "doc.retention.days",
} as const;

export const APP_SETTING_LABELS: Record<string, string> = {
  [APP_SETTING_KEYS.mandateTemplateUrl]: "委任書格式下載連結",
  [APP_SETTING_KEYS.bankbookHint]: "存摺封面上傳說明",
  [APP_SETTING_KEYS.documentRetentionDays]: "文件原檔保留天數（審核完成起算，0 = 不自動刪除）",
};

// 存摺是金融個資，只保留完成會計核對所需的合理期間。
export const DEFAULT_RETENTION_DAYS = 90;

let tableReady = false;

async function ensureAppSettingTable() {
  if (tableReady) return;
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS AppSetting (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL DEFAULT '',
      updatedBy TEXT NOT NULL DEFAULT '',
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  tableReady = true;
}

// 只接受 https 連結，避免有人存進 javascript: 之類的東西再渲染到老師端頁面
function safeUrl(value: string) {
  const text = value.trim();
  if (!text) return "";
  try {
    const url = new URL(text);
    return url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

export async function getAppSetting(key: string) {
  await ensureAppSettingTable();
  const rows = await prisma.$queryRawUnsafe<Array<{ value: string }>>(
    "SELECT value FROM AppSetting WHERE key = ? LIMIT 1",
    key,
  );
  const value = rows[0]?.value ?? "";
  return key.endsWith(".url") ? safeUrl(value) : value;
}

export async function documentRetentionDays() {
  const raw = (await getAppSetting(APP_SETTING_KEYS.documentRetentionDays)).trim();
  if (!raw) return DEFAULT_RETENTION_DAYS;
  // 2026-07 安全政策由一年縮短為 90 天；舊環境即使曾明確存過 365，
  // 也不能繼續蓋過新的公司政策。
  if (raw === "365") return DEFAULT_RETENTION_DAYS;
  const days = Number(raw);
  // 設定壞掉時退回預設，不要因為打錯字就變成永不刪除或立刻全刪
  if (!Number.isInteger(days) || days < 0 || days > 3650) return DEFAULT_RETENTION_DAYS;
  return days;
}

export async function listAppSettings() {
  await ensureAppSettingTable();
  const rows = await prisma.$queryRawUnsafe<Array<{ key: string; value: string; updatedBy: string; updatedAt: string }>>(
    "SELECT key, value, updatedBy, updatedAt FROM AppSetting",
  );
  const map = new Map(rows.map((row) => [row.key, row]));
  return Object.values(APP_SETTING_KEYS).map((key) => ({
    key,
    label: APP_SETTING_LABELS[key] ?? key,
    value: map.get(key)?.value ?? "",
    updatedBy: map.get(key)?.updatedBy ?? "",
    updatedAt: map.get(key)?.updatedAt ?? "",
  }));
}

export async function setAppSetting(key: string, value: string, updatedBy: string) {
  await ensureAppSettingTable();
  const stored = key.endsWith(".url") ? safeUrl(value) : value.trim();
  if (key.endsWith(".url") && value.trim() && !stored) {
    throw new Error("連結必須是 https 開頭的網址");
  }
  if (key.endsWith(".days") && stored) {
    const days = Number(stored);
    if (!Number.isInteger(days) || days < 0 || days > 3650) {
      throw new Error("保留天數必須是 0 到 3650 之間的整數");
    }
  }
  await prisma.$executeRawUnsafe(
    `INSERT INTO AppSetting (key, value, updatedBy, updatedAt)
     VALUES (?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedBy = excluded.updatedBy, updatedAt = CURRENT_TIMESTAMP`,
    key,
    stored,
    updatedBy,
  );
  return stored;
}
