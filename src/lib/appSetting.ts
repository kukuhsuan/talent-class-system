import { prisma } from "@/lib/prisma";

// 通用設定表：目前放文件範本下載連結。
// 規格要求「連結不可寫死在程式裡，管理者可隨時更換」。
export const APP_SETTING_KEYS = {
  mandateTemplateUrl: "doc.template.mandate.url",
  bankbookHint: "doc.template.bankbook.hint",
  documentRetentionDays: "doc.retention.days",
  bankbookRetentionDays: "doc.retention.bankbook.days",
} as const;

export const APP_SETTING_LABELS: Record<string, string> = {
  [APP_SETTING_KEYS.mandateTemplateUrl]: "委任書格式下載連結",
  [APP_SETTING_KEYS.bankbookHint]: "存摺封面上傳說明",
  [APP_SETTING_KEYS.documentRetentionDays]: "委任書原檔保留天數（審核完成起算，0 = 不自動刪除）",
  [APP_SETTING_KEYS.bankbookRetentionDays]: "存摺原檔保留天數（上傳日起算，未審核也會刪，0 = 不自動刪除）",
};

// 委任書屬授權文件，保留到會計核對結束即可。
export const DEFAULT_RETENTION_DAYS = 90;
// 存摺是金融個資，公司政策為上傳後最多留 30 天，且不論是否已審核都要刪。
export const DEFAULT_BANKBOOK_RETENTION_DAYS = 30;

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

function parseRetentionDays(raw: string, fallback: number, supersededValues: string[]) {
  const value = raw.trim();
  if (!value) return fallback;
  // 政策收緊時，舊環境即使曾明確存過較長的天數，也不能繼續蓋過新的公司政策。
  if (supersededValues.includes(value)) return fallback;
  const days = Number(value);
  // 設定壞掉時退回預設，不要因為打錯字就變成永不刪除或立刻全刪
  if (!Number.isInteger(days) || days < 0 || days > 3650) return fallback;
  return days;
}

// 委任書：2026-07 由一年縮短為 90 天
export async function documentRetentionDays() {
  const raw = await getAppSetting(APP_SETTING_KEYS.documentRetentionDays);
  return parseRetentionDays(raw, DEFAULT_RETENTION_DAYS, ["365"]);
}

// 存摺：2026-08 由沿用委任書的 90 天改為獨立的 30 天
export async function bankbookRetentionDays() {
  const raw = await getAppSetting(APP_SETTING_KEYS.bankbookRetentionDays);
  return parseRetentionDays(raw, DEFAULT_BANKBOOK_RETENTION_DAYS, ["90", "365"]);
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
