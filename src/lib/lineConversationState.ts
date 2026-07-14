import { prisma } from "@/lib/prisma";

let tableReady = false;

async function ensureLineConversationStateTable() {
  if (tableReady) return;
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "LineConversationState" (
      "lineUserId" TEXT NOT NULL,
      "action" TEXT NOT NULL,
      "referenceId" INTEGER NOT NULL,
      "expiresAt" DATETIME NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY ("lineUserId", "action")
    )
  `);
  tableReady = true;
}

export async function setLineConversationState(input: {
  lineUserId: string;
  action: string;
  referenceId: number;
  ttlMinutes?: number;
}) {
  await ensureLineConversationStateTable();
  const ttlMinutes = Math.max(1, Math.min(120, input.ttlMinutes ?? 30));
  await prisma.$executeRawUnsafe(
    `INSERT INTO "LineConversationState"
      ("lineUserId", "action", "referenceId", "expiresAt", "createdAt", "updatedAt")
     VALUES (?, ?, ?, datetime('now', ?), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON CONFLICT("lineUserId", "action") DO UPDATE SET
       "referenceId" = excluded."referenceId",
       "expiresAt" = excluded."expiresAt",
       "updatedAt" = CURRENT_TIMESTAMP`,
    input.lineUserId,
    input.action,
    input.referenceId,
    `+${ttlMinutes} minutes`,
  );
}

export async function getLineConversationState(lineUserId: string, action: string) {
  await ensureLineConversationStateTable();
  const rows = await prisma.$queryRawUnsafe<Array<{ referenceId: number }>>(
    `SELECT "referenceId" FROM "LineConversationState"
     WHERE "lineUserId" = ? AND "action" = ? AND "expiresAt" > CURRENT_TIMESTAMP
     LIMIT 1`,
    lineUserId,
    action,
  );
  return rows.length ? Number(rows[0].referenceId) : null;
}

export async function deleteLineConversationState(lineUserId: string, action: string) {
  await ensureLineConversationStateTable();
  await prisma.$executeRawUnsafe(
    `DELETE FROM "LineConversationState" WHERE "lineUserId" = ? AND "action" = ?`,
    lineUserId,
    action,
  );
}
