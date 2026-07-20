import { prisma } from "@/lib/prisma";
import { getLineConfig, pushMessage } from "@/lib/line";
import type { BatchRecipientMessage, NotifyTargetType } from "@/lib/notifyTemplates";

// 客服批次通知：批次資料表與發送引擎
// - 批次 UUID idempotency：同一 uuid 重送直接回傳既有結果
// - 單批上限 100、併發 3、失敗重試 1 次
// - 同批次同收件人 UNIQUE 防重複
// - dry-run 模式完全不打 LINE API（驗收模擬用）

export const BATCH_MAX_RECIPIENTS = 100;
const CONCURRENCY = 3;

let tablesReady = false;
export async function ensureNotifyBatchTables() {
  if (tablesReady) return;
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS NotifyBatch (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uuid TEXT NOT NULL UNIQUE,
      actorId INTEGER,
      actorName TEXT NOT NULL DEFAULT '',
      actorRole TEXT NOT NULL DEFAULT '',
      templateKey TEXT NOT NULL DEFAULT '',
      templateLabel TEXT NOT NULL DEFAULT '',
      messageSummary TEXT NOT NULL DEFAULT '',
      targetType TEXT NOT NULL DEFAULT 'teacher',
      testMode INTEGER NOT NULL DEFAULT 0,
      dryRun INTEGER NOT NULL DEFAULT 0,
      total INTEGER NOT NULL DEFAULT 0,
      success INTEGER NOT NULL DEFAULT 0,
      failed INTEGER NOT NULL DEFAULT 0,
      unbound INTEGER NOT NULL DEFAULT 0,
      skipped INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'sending',
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      finishedAt TEXT
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS NotifyBatchRecipient (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      batchId INTEGER NOT NULL,
      recipientType TEXT NOT NULL,
      recipientId INTEGER NOT NULL,
      name TEXT NOT NULL DEFAULT '',
      lineRegion TEXT NOT NULL DEFAULT '',
      maskedLineId TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      error TEXT NOT NULL DEFAULT '',
      message TEXT NOT NULL DEFAULT '',
      sentAt TEXT,
      ackToken TEXT NOT NULL DEFAULT '',
      ackAt TEXT,
      UNIQUE(batchId, recipientType, recipientId)
    )
  `);
  // 舊表補欄位（SQLite 無 IF NOT EXISTS，重複加會丟錯 → 忽略）
  await prisma.$executeRawUnsafe("ALTER TABLE NotifyBatchRecipient ADD COLUMN ackToken TEXT NOT NULL DEFAULT ''").catch(() => undefined);
  await prisma.$executeRawUnsafe("ALTER TABLE NotifyBatchRecipient ADD COLUMN ackAt TEXT").catch(() => undefined);
  await prisma.$executeRawUnsafe("CREATE INDEX IF NOT EXISTS idx_nbr_batch ON NotifyBatchRecipient(batchId)").catch(() => undefined);
  await prisma.$executeRawUnsafe("CREATE INDEX IF NOT EXISTS idx_nbr_ack ON NotifyBatchRecipient(ackToken)").catch(() => undefined);
  tablesReady = true;
}

// 遮罩 LINE User ID：只留前 6 碼
export function maskLineId(id: string | null | undefined) {
  const value = String(id ?? "");
  return value ? `${value.slice(0, 6)}…` : "";
}

// 危險連結檢查：只允許 http/https 協定的網址出現在訊息中
export function hasDangerousLink(text: string) {
  return /(javascript|data|vbscript|file)\s*:/i.test(text);
}

export type BatchRow = {
  id: number; uuid: string; actorName: string; actorRole: string;
  templateKey: string; templateLabel: string; messageSummary: string;
  targetType: string; testMode: number; dryRun: number;
  total: number; success: number; failed: number; unbound: number; skipped: number;
  status: string; createdAt: string; finishedAt: string | null;
};

function normalizeBatch(row: Record<string, unknown>): BatchRow {
  return {
    id: Number(row.id), uuid: String(row.uuid ?? ""),
    actorName: String(row.actorName ?? ""), actorRole: String(row.actorRole ?? ""),
    templateKey: String(row.templateKey ?? ""), templateLabel: String(row.templateLabel ?? ""),
    messageSummary: String(row.messageSummary ?? ""), targetType: String(row.targetType ?? ""),
    testMode: Number(row.testMode ?? 0), dryRun: Number(row.dryRun ?? 0),
    total: Number(row.total ?? 0), success: Number(row.success ?? 0), failed: Number(row.failed ?? 0),
    unbound: Number(row.unbound ?? 0), skipped: Number(row.skipped ?? 0),
    status: String(row.status ?? ""), createdAt: String(row.createdAt ?? ""),
    finishedAt: row.finishedAt == null ? null : String(row.finishedAt),
  };
}

export async function getBatchByUuid(uuid: string) {
  await ensureNotifyBatchTables();
  const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
    "SELECT * FROM NotifyBatch WHERE uuid = ? LIMIT 1", uuid,
  );
  return rows[0] ? normalizeBatch(rows[0]) : null;
}

export async function getBatchById(id: number) {
  await ensureNotifyBatchTables();
  const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
    "SELECT * FROM NotifyBatch WHERE id = ? LIMIT 1", id,
  );
  return rows[0] ? normalizeBatch(rows[0]) : null;
}

export async function listBatches(limit = 50) {
  await ensureNotifyBatchTables();
  const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
    "SELECT * FROM NotifyBatch ORDER BY id DESC LIMIT ?", Math.min(Math.max(limit, 1), 200),
  );
  return rows.map(normalizeBatch);
}

export async function listBatchRecipients(batchId: number) {
  await ensureNotifyBatchTables();
  const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
    "SELECT id, recipientType, recipientId, name, lineRegion, maskedLineId, status, error, message, sentAt, ackAt FROM NotifyBatchRecipient WHERE batchId = ? ORDER BY id ASC",
    batchId,
  );
  return rows.map((r) => ({
    id: Number(r.id), recipientType: String(r.recipientType ?? ""), recipientId: Number(r.recipientId),
    name: String(r.name ?? ""), lineRegion: String(r.lineRegion ?? ""), maskedLineId: String(r.maskedLineId ?? ""),
    status: String(r.status ?? ""), error: String(r.error ?? ""), message: String(r.message ?? ""),
    sentAt: r.sentAt == null ? null : String(r.sentAt),
    ackAt: r.ackAt == null ? null : String(r.ackAt),
  }));
}

// ── 確認收到（公開頁使用；token 為每人專屬 32 碼亂數）─────────
export async function getAckInfo(token: string) {
  await ensureNotifyBatchTables();
  if (!/^[0-9a-f]{32}$/.test(token)) return null;
  const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
    `SELECT r.id, r.name, r.ackAt, b.templateLabel, b.createdAt
     FROM NotifyBatchRecipient r JOIN NotifyBatch b ON b.id = r.batchId
     WHERE r.ackToken = ? LIMIT 1`, token,
  );
  const r = rows[0];
  if (!r) return null;
  return {
    name: String(r.name ?? ""),
    templateLabel: String(r.templateLabel ?? ""),
    sentAt: String(r.createdAt ?? ""),
    ackAt: r.ackAt == null ? null : String(r.ackAt),
  };
}

export async function confirmAck(token: string) {
  const info = await getAckInfo(token);
  if (!info) return null;
  if (!info.ackAt) {
    await prisma.$executeRawUnsafe(
      "UPDATE NotifyBatchRecipient SET ackAt = datetime('now') WHERE ackToken = ? AND ackAt IS NULL", token,
    );
  }
  return getAckInfo(token);
}

// 清洗錯誤訊息：不外洩 token/secret
function sanitizeError(message: string) {
  return String(message ?? "")
    .replace(/Bearer\s+[A-Za-z0-9+/=._-]+/g, "Bearer ［已遮蔽］")
    .replace(/[A-Za-z0-9+/=]{40,}/g, "［已遮蔽］")
    .slice(0, 300);
}

type RunOptions = {
  uuid: string;
  actor: { userId: number | null; name: string; role: string };
  templateKey: string;
  templateLabel: string;
  targetType: NotifyTargetType;
  recipients: BatchRecipientMessage[];
  testMode: boolean;
  dryRun: boolean;
};

export async function runNotifyBatch(opts: RunOptions) {
  await ensureNotifyBatchTables();

  // idempotency：同一 uuid 已存在 → 直接回傳既有批次（防止重複點擊重送）
  const existing = await getBatchByUuid(opts.uuid);
  if (existing) return { batch: existing, duplicated: true };

  if (opts.recipients.length === 0) throw new Error("沒有可發送的收件人");
  if (opts.recipients.length > BATCH_MAX_RECIPIENTS) throw new Error(`單批最多 ${BATCH_MAX_RECIPIENTS} 位收件人`);

  const firstMessage = opts.recipients.find((r) => r.message)?.message ?? "";
  const summary = firstMessage.replace(/\s+/g, " ").slice(0, 120);

  await prisma.$executeRawUnsafe(
    `INSERT INTO NotifyBatch (uuid, actorId, actorName, actorRole, templateKey, templateLabel, messageSummary, targetType, testMode, dryRun, total, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'sending')`,
    opts.uuid, opts.actor.userId, opts.actor.name, opts.actor.role,
    opts.templateKey, opts.templateLabel, summary, opts.targetType,
    opts.testMode ? 1 : 0, opts.dryRun ? 1 : 0, opts.recipients.length,
  );
  const batchRow = await getBatchByUuid(opts.uuid);
  if (!batchRow) throw new Error("批次建立失敗");
  const batchId = batchRow.id;

  // 先寫入收件人（UNIQUE 防同批重複；INSERT OR IGNORE 去重）
  for (const r of opts.recipients) {
    await prisma.$executeRawUnsafe(
      `INSERT OR IGNORE INTO NotifyBatchRecipient (batchId, recipientType, recipientId, name, lineRegion, maskedLineId, status, error, message, ackToken)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', '', ?, ?)`,
      batchId, opts.targetType, r.id, r.name, r.lineRegion, maskLineId(r.lineUserId), r.message, r.ackToken ?? "",
    );
  }

  const setStatus = (recipientId: number, status: string, error = "") =>
    prisma.$executeRawUnsafe(
      "UPDATE NotifyBatchRecipient SET status = ?, error = ?, sentAt = datetime('now') WHERE batchId = ? AND recipientType = ? AND recipientId = ?",
      status, error, batchId, opts.targetType, recipientId,
    );

  let success = 0, failed = 0, unbound = 0, skipped = 0;

  const sendOne = async (r: BatchRecipientMessage) => {
    if (r.skipped) { skipped++; await setStatus(r.id, "skipped", r.skipped); return; }
    if (!r.lineUserId) { unbound++; await setStatus(r.id, "unbound", "尚未綁定 LINE"); return; }
    if (!r.message.trim()) { skipped++; await setStatus(r.id, "skipped", "訊息內容為空"); return; }
    if (hasDangerousLink(r.message)) { skipped++; await setStatus(r.id, "skipped", "訊息包含不允許的連結協定"); return; }
    if (opts.dryRun) { success++; await setStatus(r.id, "success", "dry-run 模擬（未實際發送）"); return; }
    // 依收件人各自的 LINE 官方帳號分組取 token（不共用同一組）
    const { token } = getLineConfig(r.lineRegion);
    let lastError = "";
    for (let attempt = 0; attempt < 2; attempt++) { // 最多重試 1 次
      try {
        await pushMessage(r.lineUserId, [{ type: "text", text: r.message }], token);
        success++;
        await setStatus(r.id, "success");
        return;
      } catch (e) {
        lastError = sanitizeError((e as Error).message);
        if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
    failed++;
    await setStatus(r.id, "failed", lastError || "發送失敗");
  };

  // 併發 3 的簡單 worker pool
  const queue = [...opts.recipients];
  const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
    while (queue.length > 0) {
      const item = queue.shift();
      if (!item) break;
      await sendOne(item);
    }
  });
  await Promise.all(workers);

  await prisma.$executeRawUnsafe(
    "UPDATE NotifyBatch SET success = ?, failed = ?, unbound = ?, skipped = ?, status = 'done', finishedAt = datetime('now') WHERE id = ?",
    success, failed, unbound, skipped, batchId,
  );
  const finished = await getBatchById(batchId);
  return { batch: finished!, duplicated: false };
}
