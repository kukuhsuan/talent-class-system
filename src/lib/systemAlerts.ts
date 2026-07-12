import { prisma } from "@/lib/prisma";
import { getLineConfig, pushMessage } from "@/lib/line";
import type { LineRegion } from "@/lib/line";

/**
 * 系統異常管理中心（M12）
 *
 * - SystemAlert 表：集中收未回報、代課懸空、請款斷鏈、通知失敗等異常
 * - dedupeKey：每日 cron 重複掃描不會重複開單（INSERT OR IGNORE + 唯一索引）
 * - P1 異常：若設定 ADMIN_ALERT_LINE_USER_ID，建立當下即推播 LINE 給主管
 */

export const ALERT_LEVELS = ["P1", "P2", "P3"] as const;
export type AlertLevel = (typeof ALERT_LEVELS)[number];

export const ALERT_STATUS = {
  open: "未處理",
  resolved: "已處理",
  ignored: "已忽略",
} as const;

export type SystemAlertRow = {
  id: number;
  level: string;
  category: string;
  title: string;
  detail: string;
  dedupeKey: string;
  status: string;
  resolvedBy: string;
  resolutionNote: string;
  resolvedAt: string | null;
  notifiedAt: string | null;
  createdAt: string;
};

let alertTableReady = false;

export async function ensureSystemAlertTable() {
  if (alertTableReady) return;
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "SystemAlert" (
      "id" INTEGER PRIMARY KEY AUTOINCREMENT,
      "level" TEXT NOT NULL DEFAULT 'P2',
      "category" TEXT NOT NULL DEFAULT '',
      "title" TEXT NOT NULL DEFAULT '',
      "detail" TEXT NOT NULL DEFAULT '',
      "dedupeKey" TEXT NOT NULL DEFAULT '',
      "status" TEXT NOT NULL DEFAULT '未處理',
      "resolvedBy" TEXT NOT NULL DEFAULT '',
      "resolvedAt" DATETIME,
      "notifiedAt" DATETIME,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await prisma.$executeRawUnsafe(
    'CREATE UNIQUE INDEX IF NOT EXISTS "SystemAlert_dedupeKey" ON "SystemAlert"("dedupeKey") WHERE "dedupeKey" != \'\'',
  ).catch(() => undefined);
  await prisma.$executeRawUnsafe('ALTER TABLE "SystemAlert" ADD COLUMN "resolutionNote" TEXT NOT NULL DEFAULT \'\'').catch(() => undefined);
  alertTableReady = true;
}

/** 推播文字訊息給主管（未設定 ADMIN_ALERT_LINE_USER_ID 時靜默略過） */
export async function pushAdminAlert(text: string): Promise<boolean> {
  const to = process.env.ADMIN_ALERT_LINE_USER_ID?.trim();
  if (!to) return false;
  const region = (process.env.ADMIN_ALERT_LINE_REGION?.trim() || "north") as LineRegion;
  const token = getLineConfig(region).token;
  if (!token) return false;
  await pushMessage(to, [{ type: "text", text }], token);
  return true;
}

/**
 * 開立異常單。回傳是否為新開（dedupeKey 已存在則跳過、不重複推播）。
 * P1 且新開 → 立即推 LINE 給主管（失敗不影響開單）。
 */
export async function raiseSystemAlert(input: {
  level: AlertLevel;
  category: string;
  title: string;
  detail?: string;
  dedupeKey?: string;
}): Promise<boolean> {
  await ensureSystemAlertTable();
  const dedupeKey = input.dedupeKey ?? "";
  const inserted = await prisma.$executeRawUnsafe(
    `INSERT OR IGNORE INTO "SystemAlert" ("level", "category", "title", "detail", "dedupeKey")
     VALUES (?, ?, ?, ?, ?)`,
    input.level,
    input.category,
    input.title,
    input.detail ?? "",
    dedupeKey,
  );
  const isNew = Number(inserted) > 0;
  if (isNew && input.level === "P1") {
    try {
      const pushed = await pushAdminAlert(`🚨【${input.category}】${input.title}\n${input.detail ?? ""}`.trim());
      if (pushed && dedupeKey) {
        await prisma.$executeRawUnsafe(
          `UPDATE "SystemAlert" SET "notifiedAt" = CURRENT_TIMESTAMP WHERE "dedupeKey" = ?`,
          dedupeKey,
        );
      }
    } catch (error) {
      console.error("pushAdminAlert failed:", error);
    }
  }
  return isNew;
}

export async function listSystemAlerts(filter: { status?: string; level?: string } = {}) {
  await ensureSystemAlertTable();
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (filter.status) { conditions.push('"status" = ?'); params.push(filter.status); }
  if (filter.level) { conditions.push('"level" = ?'); params.push(filter.level); }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  return prisma.$queryRawUnsafe<SystemAlertRow[]>(
    `SELECT "id", "level", "category", "title", "detail", "dedupeKey", "status",
            "resolvedBy", "resolutionNote", "resolvedAt", "notifiedAt", "createdAt"
     FROM "SystemAlert" ${where}
     ORDER BY CASE "level" WHEN 'P1' THEN 0 WHEN 'P2' THEN 1 ELSE 2 END, "createdAt" DESC
     LIMIT 500`,
    ...params,
  );
}

export async function updateSystemAlertStatus(id: number, status: string, actorName: string, resolutionNote = "") {
  await ensureSystemAlertTable();
  const done = status === ALERT_STATUS.resolved || status === ALERT_STATUS.ignored;
  await prisma.$executeRawUnsafe(
    `UPDATE "SystemAlert"
     SET "status" = ?, "resolvedBy" = ?, "resolutionNote" = ?, "resolvedAt" = ${done ? "CURRENT_TIMESTAMP" : "NULL"}, "updatedAt" = CURRENT_TIMESTAMP
     WHERE "id" = ?`,
    status,
    done ? actorName : "",
    done ? resolutionNote : "",
    id,
  );
}
