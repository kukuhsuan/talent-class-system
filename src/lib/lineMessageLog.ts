import { prisma } from "@/lib/prisma";
import { raiseSystemAlert } from "@/lib/systemAlerts";

/**
 * LINE 發送紀錄（C-1）
 *
 * - 每次 push / reply 都寫入 LineMessageLog（成功與失敗都留痕）
 * - 發送失敗自動開 P2 異常單（不推播主管，避免推播失敗→再開單的遞迴）
 * - 寫紀錄本身失敗不影響發送流程（try/catch 靜默）
 */

let logTableReady = false;

async function ensureLineMessageLogTable() {
  if (logTableReady) return;
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "LineMessageLog" (
      "id" INTEGER PRIMARY KEY AUTOINCREMENT,
      "kind" TEXT NOT NULL DEFAULT 'push',
      "recipient" TEXT NOT NULL DEFAULT '',
      "messageType" TEXT NOT NULL DEFAULT '',
      "summary" TEXT NOT NULL DEFAULT '',
      "success" INTEGER NOT NULL DEFAULT 0,
      "error" TEXT NOT NULL DEFAULT '',
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await prisma.$executeRawUnsafe(
    'CREATE INDEX IF NOT EXISTS "LineMessageLog_createdAt" ON "LineMessageLog"("createdAt")',
  ).catch(() => undefined);
  logTableReady = true;
}

function summarize(messages: object[]): { messageType: string; summary: string } {
  const first = (messages[0] ?? {}) as { type?: string; text?: string; altText?: string };
  const messageType = first.type ?? "";
  const summary = (first.text ?? first.altText ?? "").slice(0, 120);
  return { messageType, summary };
}

export async function logLineMessage(input: {
  kind: "push" | "reply";
  recipient: string;
  messages: object[];
  success: boolean;
  error?: string;
}) {
  try {
    await ensureLineMessageLogTable();
    const { messageType, summary } = summarize(input.messages);
    await prisma.$executeRawUnsafe(
      `INSERT INTO "LineMessageLog" ("kind", "recipient", "messageType", "summary", "success", "error")
       VALUES (?, ?, ?, ?, ?, ?)`,
      input.kind,
      input.recipient,
      messageType,
      summary,
      input.success ? 1 : 0,
      (input.error ?? "").slice(0, 300),
    );
    if (!input.success) {
      // P2：進異常中心供行政追蹤，不立即推播主管（避免遞迴）
      await raiseSystemAlert({
        level: "P2",
        category: "LINE發送失敗",
        title: `LINE ${input.kind} 失敗（${summary || input.recipient}）`,
        detail: `對象：${input.recipient}\n錯誤：${(input.error ?? "").slice(0, 200)}`,
        dedupeKey: `line-fail:${input.recipient}:${new Date().toISOString().slice(0, 10)}:${summary.slice(0, 40)}`,
      });
    }
  } catch (error) {
    console.error("logLineMessage failed:", error);
  }
}

export type LineMessageLogRow = {
  id: number;
  kind: string;
  recipient: string;
  messageType: string;
  summary: string;
  success: number;
  error: string;
  createdAt: string;
};

export async function listLineMessageLogs(filter: { success?: boolean; limit?: number } = {}) {
  await ensureLineMessageLogTable();
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (filter.success !== undefined) { conditions.push('"success" = ?'); params.push(filter.success ? 1 : 0); }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = Math.min(Math.max(filter.limit ?? 200, 1), 500);
  return prisma.$queryRawUnsafe<LineMessageLogRow[]>(
    `SELECT "id", "kind", "recipient", "messageType", "summary", "success", "error", "createdAt"
     FROM "LineMessageLog" ${where}
     ORDER BY "createdAt" DESC
     LIMIT ${limit}`,
    ...params,
  );
}
