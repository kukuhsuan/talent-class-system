import { prisma } from "@/lib/prisma";
import { deleteSensitiveDocument } from "@/lib/sensitiveBlob";

export type BlobDeletionRetryRow = {
  id: number;
  attempts: number;
  lastError: string;
  createdAt: string;
  lastAttemptAt: string;
};

let tableReady = false;

export async function ensureSensitiveBlobDeletionQueue() {
  if (tableReady) return;
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS SensitiveBlobDeletionQueue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pathname TEXT NOT NULL UNIQUE,
      source TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,
      lastError TEXT NOT NULL DEFAULT '',
      nextRetryAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      lastAttemptAt DATETIME,
      completedAt DATETIME,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await prisma.$executeRawUnsafe(
    'CREATE INDEX IF NOT EXISTS SensitiveBlobDeletionQueue_pending_idx ON SensitiveBlobDeletionQueue(status, nextRetryAt)',
  );
  tableReady = true;
}

// pathname 是敏感內部資料，只能留在專用佇列表；不回前端、不放稽核文字。
export async function enqueueSensitiveBlobDeletion(pathname: string, source: string, error: string) {
  if (!pathname) return;
  await ensureSensitiveBlobDeletionQueue();
  await prisma.$executeRawUnsafe(
    `INSERT INTO SensitiveBlobDeletionQueue
       (pathname, source, status, attempts, lastError, nextRetryAt, updatedAt)
     VALUES (?, ?, 'pending', 1, ?, datetime('now', '+15 minutes'), CURRENT_TIMESTAMP)
     ON CONFLICT(pathname) DO UPDATE SET
       source = excluded.source,
       status = 'pending',
       attempts = SensitiveBlobDeletionQueue.attempts + 1,
       lastError = excluded.lastError,
       nextRetryAt = datetime('now', '+15 minutes'),
       updatedAt = CURRENT_TIMESTAMP`,
    pathname,
    source,
    error.slice(0, 500),
  );
}

export async function deleteSensitiveDocumentOrQueue(pathname: string, source: string) {
  if (!pathname) return true;
  const result = await deleteSensitiveDocument(pathname);
  if (result.ok) return true;
  await enqueueSensitiveBlobDeletion(pathname, source, result.error || "Blob deletion failed");
  return false;
}

export async function processSensitiveBlobDeletionQueue(limit = 100) {
  await ensureSensitiveBlobDeletionQueue();
  const rows = await prisma.$queryRawUnsafe<Array<BlobDeletionRetryRow & { pathname: string }>>(
    `SELECT id, pathname, attempts, lastError, createdAt, lastAttemptAt
       FROM SensitiveBlobDeletionQueue
      WHERE status = 'pending' AND nextRetryAt <= CURRENT_TIMESTAMP
      ORDER BY nextRetryAt ASC
      LIMIT ?`,
    Math.max(1, Math.min(limit, 200)),
  );

  const completed: number[] = [];
  const failed: BlobDeletionRetryRow[] = [];
  for (const row of rows) {
    const result = await deleteSensitiveDocument(row.pathname);
    if (result.ok) {
      await prisma.$executeRawUnsafe(
        `UPDATE SensitiveBlobDeletionQueue
            SET status = 'completed', completedAt = CURRENT_TIMESTAMP,
                lastAttemptAt = CURRENT_TIMESTAMP, updatedAt = CURRENT_TIMESTAMP
          WHERE id = ?`,
        row.id,
      );
      completed.push(row.id);
      continue;
    }

    const attempts = Number(row.attempts) + 1;
    // 指數退避，上限 24 小時。路徑刻意不出現在錯誤／稽核訊息裡。
    const delayMinutes = Math.min(24 * 60, 15 * 2 ** Math.min(attempts - 1, 7));
    await prisma.$executeRawUnsafe(
      `UPDATE SensitiveBlobDeletionQueue
          SET attempts = ?, lastError = ?, lastAttemptAt = CURRENT_TIMESTAMP,
              nextRetryAt = datetime('now', ?), updatedAt = CURRENT_TIMESTAMP
        WHERE id = ?`,
      attempts,
      (result.error || "Blob deletion failed").slice(0, 500),
      `+${delayMinutes} minutes`,
      row.id,
    );
    failed.push({ ...row, attempts, lastError: result.error || "Blob deletion failed" });
  }
  return { processed: rows.length, completed, failed };
}
