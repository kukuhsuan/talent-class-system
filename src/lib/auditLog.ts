import crypto from "node:crypto";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentSessionUser, requestIp } from "@/lib/permissions";
import { requiredAuthSecret } from "@/lib/authSecret";

// 銀行帳號不進稽核明碼。但「帳號變更提醒」要靠比對前後值，
// 所以除了遮罩再附一段不可逆指紋：內容不同指紋就不同，指紋卻推不回帳號。
const BANK_ACCOUNT_KEY = /bankAccountNumber$/i;

function bankFingerprint(account: string) {
  return crypto.createHmac("sha256", requiredAuthSecret()).update(account).digest("hex").slice(0, 8);
}

export function maskAuditBankAccount(value: unknown) {
  const account = String(value ?? "").replace(/[\s-]/g, "");
  if (!account) return "";
  const masked = account.length <= 4 ? "*".repeat(account.length) : `******${account.slice(-4)}`;
  return `${masked}#${bankFingerprint(account)}`;
}

const SECRET_PATTERNS = [
  /password/i,
  /passwordHash/i,
  /token/i,
  /secret/i,
  /ADMIN_PASSWORD/i,
  /AUTH_SECRET/i,
  /CRON_SECRET/i,
  /MAINTENANCE_SECRET/i,
  /LINE_.*SECRET/i,
];

let auditStorageReady = false;
let userAccountColumnsReady = false;

export type AuditAction =
  | "create"
  | "update"
  | "delete"
  | "soft_delete"
  | "restore"
  | "approve"
  | "reject"
  | "export"
  | "send_line"
  | "login"
  | "logout"
  | "reopen"
  | "lock"
  | "unlock"
  | "reset_password";

export type AuditInput = {
  actorUserId?: number | null;
  actorName?: string;
  actorRole?: string;
  action: AuditAction | string;
  targetType: string;
  targetId?: string | number | null;
  targetLabel?: string;
  beforeData?: unknown;
  afterData?: unknown;
  diffSummary?: string;
  sensitive?: boolean;
};

export type AuditLogRow = {
  id: number;
  actorUserId: number | null;
  actorName: string;
  actorRole: string;
  action: string;
  targetType: string;
  targetId: string;
  targetLabel: string;
  beforeData: string;
  afterData: string;
  diffSummary: string;
  ipAddress: string;
  userAgent: string;
  sensitive: boolean | number;
  createdAt: string;
};

async function hasColumn(table: string, columnName: string) {
  const rows = await prisma.$queryRawUnsafe<Array<{ name: string }>>(`PRAGMA table_info("${table}")`);
  return rows.some((column) => column.name === columnName);
}

export async function ensureUserAccountAuditColumns() {
  if (userAccountColumnsReady) return;
  if (!(await hasColumn("UserAccount", "email"))) {
    await prisma.$executeRawUnsafe('ALTER TABLE "UserAccount" ADD COLUMN "email" TEXT NOT NULL DEFAULT ""').catch(() => undefined);
  }
  if (!(await hasColumn("UserAccount", "lastLoginAt"))) {
    await prisma.$executeRawUnsafe('ALTER TABLE "UserAccount" ADD COLUMN "lastLoginAt" DATETIME').catch(() => undefined);
  }
  userAccountColumnsReady = true;
}

export async function ensureAuditLogStorage() {
  if (auditStorageReady) return;
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "AuditLog" (
      "id" INTEGER PRIMARY KEY AUTOINCREMENT,
      "actorUserId" INTEGER,
      "actorName" TEXT NOT NULL DEFAULT '',
      "actorRole" TEXT NOT NULL DEFAULT '',
      "action" TEXT NOT NULL,
      "targetType" TEXT NOT NULL,
      "targetId" TEXT NOT NULL DEFAULT '',
      "targetLabel" TEXT NOT NULL DEFAULT '',
      "beforeData" TEXT NOT NULL DEFAULT '',
      "afterData" TEXT NOT NULL DEFAULT '',
      "diffSummary" TEXT NOT NULL DEFAULT '',
      "ipAddress" TEXT NOT NULL DEFAULT '',
      "userAgent" TEXT NOT NULL DEFAULT '',
      "sensitive" BOOLEAN NOT NULL DEFAULT false,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "AuditLog_actorUserId_idx" ON "AuditLog"("actorUserId")');
  await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "AuditLog_action_idx" ON "AuditLog"("action")');
  await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "AuditLog_targetType_idx" ON "AuditLog"("targetType")');
  await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "AuditLog_createdAt_idx" ON "AuditLog"("createdAt")');
  await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "AuditLog_sensitive_idx" ON "AuditLog"("sensitive")');
  auditStorageReady = true;
}

function sanitizeValue(value: unknown, keyPath = ""): unknown {
  if (value == null) return value;
  if (SECRET_PATTERNS.some((pattern) => pattern.test(keyPath))) return "[REDACTED]";
  if (BANK_ACCOUNT_KEY.test(keyPath)) return maskAuditBankAccount(value);
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((item, index) => sanitizeValue(item, `${keyPath}.${index}`));
  if (typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      result[key] = sanitizeValue(child, keyPath ? `${keyPath}.${key}` : key);
    }
    return result;
  }
  return value;
}

function stringifyAuditData(value: unknown) {
  if (value === undefined) return "";
  try {
    return JSON.stringify(sanitizeValue(value));
  } catch {
    return "";
  }
}

function displayAuditValue(value: unknown) {
  if (value == null || value === "") return "空白";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    try {
      return JSON.stringify(sanitizeValue(value));
    } catch {
      return "[資料]";
    }
  }
  return String(value);
}

// 敏感檔案的檢視紀錄不能「盡力而為」：稽核寫不進去就不該讓人看到檔案。
// 這支寫失敗會往外丟，呼叫端自己決定要不要擋（見 teacher-documents/[id]/file）。
export async function writeAuditLogStrict(req: NextRequest | null, input: AuditInput) {
  await ensureAuditLogStorage();
  const actor = await resolveActor(input);
  await insertAuditLog(req, input, actor);
}

async function resolveActor(input: AuditInput) {
  return input.actorName || input.actorRole || input.actorUserId !== undefined
    ? {
        userId: input.actorUserId ?? null,
        name: input.actorName ?? "",
        role: input.actorRole ?? "",
      }
    : await currentSessionUser();
}

async function insertAuditLog(
  req: NextRequest | null,
  input: AuditInput,
  actor: { userId: number | null; name: string; role: string } | null | undefined,
) {
  await prisma.$executeRaw`
    INSERT INTO "AuditLog"
      ("actorUserId", "actorName", "actorRole", "action", "targetType", "targetId", "targetLabel", "beforeData", "afterData", "diffSummary", "ipAddress", "userAgent", "sensitive")
    VALUES
      (${actor?.userId ?? null}, ${actor?.name ?? ""}, ${actor?.role ?? ""}, ${input.action}, ${input.targetType}, ${String(input.targetId ?? "")}, ${input.targetLabel ?? ""}, ${stringifyAuditData(input.beforeData)}, ${stringifyAuditData(input.afterData)}, ${input.diffSummary ?? ""}, ${req ? requestIp(req) : ""}, ${req?.headers.get("user-agent") ?? ""}, ${Boolean(input.sensitive)})
  `;
}

export async function writeAuditLog(req: NextRequest | null, input: AuditInput) {
  try {
    await ensureAuditLogStorage();
    const actor = await resolveActor(input);
    await insertAuditLog(req, input, actor);
  } catch (error) {
    console.warn("audit log write failed", (error as Error).message);
  }
}

export function diffSummary(beforeData: Record<string, unknown> | null | undefined, afterData: Record<string, unknown> | null | undefined, labels: Record<string, string> = {}) {
  const before = beforeData ?? {};
  const after = afterData ?? {};
  const changes: string[] = [];
  for (const key of Object.keys(after)) {
    if (SECRET_PATTERNS.some((pattern) => pattern.test(key))) continue;
    const bank = BANK_ACCOUNT_KEY.test(key);
    const b = bank ? maskAuditBankAccount(before[key]) : before[key];
    const a = bank ? maskAuditBankAccount(after[key]) : after[key];
    if (JSON.stringify(b) !== JSON.stringify(a)) {
      changes.push(`${labels[key] ?? key}：${displayAuditValue(b)} → ${displayAuditValue(a)}`);
    }
  }
  return changes.slice(0, 8).join("；");
}

export async function readAuditLogs(filters: {
  actor?: string;
  action?: string;
  targetType?: string;
  keyword?: string;
  sensitive?: boolean;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}) {
  await ensureAuditLogStorage();
  const page = Math.max(1, filters.page || 1);
  const pageSize = Math.min(100, Math.max(20, filters.pageSize || 50));
  const where: string[] = [];
  const values: unknown[] = [];
  if (filters.actor) {
    where.push('"actorName" LIKE ?');
    values.push(`%${filters.actor}%`);
  }
  if (filters.action) {
    where.push('"action" = ?');
    values.push(filters.action);
  }
  if (filters.targetType) {
    where.push('"targetType" = ?');
    values.push(filters.targetType);
  }
  if (filters.sensitive) {
    where.push('"sensitive" = 1');
  }
  if (filters.from) {
    where.push('"createdAt" >= ?');
    values.push(filters.from);
  }
  if (filters.to) {
    where.push('"createdAt" <= ?');
    values.push(filters.to);
  }
  if (filters.keyword) {
    where.push('("targetLabel" LIKE ? OR "diffSummary" LIKE ? OR "targetId" LIKE ?)');
    values.push(`%${filters.keyword}%`, `%${filters.keyword}%`, `%${filters.keyword}%`);
  }
  const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
  const countRows = await prisma.$queryRawUnsafe<Array<{ total: number }>>(
    `SELECT COUNT(*) as total FROM "AuditLog" ${whereSql}`,
    ...values,
  );
  const rows = await prisma.$queryRawUnsafe<AuditLogRow[]>(
    `SELECT * FROM "AuditLog" ${whereSql} ORDER BY "createdAt" DESC, "id" DESC LIMIT ? OFFSET ?`,
    ...values,
    pageSize,
    (page - 1) * pageSize,
  );
  return { items: rows, total: Number(countRows[0]?.total ?? 0), page, pageSize };
}
