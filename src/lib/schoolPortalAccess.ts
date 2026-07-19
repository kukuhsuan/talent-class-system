import { prisma } from "@/lib/prisma";
import { verifySchoolPortalToken } from "@/lib/schoolPortalToken";

// 園所端連結支援兩種格式：
// 1. 短碼（新版，8 碼英數）：/school-portal/abcd2345
// 2. JWT（舊版長連結）：驗簽 + 比對 portalTokenVersion
// 「重生連結」會同時換掉短碼並讓舊 JWT 失效。

let columnsReady = false;
export async function ensurePortalColumns() {
  if (columnsReady) return;
  await prisma.$executeRawUnsafe('ALTER TABLE School ADD COLUMN portalTokenVersion INTEGER NOT NULL DEFAULT 1').catch(() => undefined);
  await prisma.$executeRawUnsafe('ALTER TABLE School ADD COLUMN portalCode TEXT').catch(() => undefined);
  columnsReady = true;
}

// 避開容易混淆的 0/O、1/l/I
const CODE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

// 52 碼 ≈ 257 bits（≥ 32 bytes 熵），密碼學安全、不可猜測、無法從 schoolId 推算
function randomPortalCode(length = 52) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const byte of bytes) out += CODE_ALPHABET[byte % CODE_ALPHABET.length];
  return out;
}

export async function getOrCreatePortalCode(schoolId: number) {
  await ensurePortalColumns();
  const rows = await prisma.$queryRawUnsafe<Array<{ portalCode: string | null }>>(
    "SELECT portalCode FROM School WHERE id = ?",
    schoolId,
  );
  const existing = String(rows[0]?.portalCode ?? "").trim();
  if (existing) return existing;
  return rotatePortalCode(schoolId);
}

export async function rotatePortalCode(schoolId: number) {
  await ensurePortalColumns();
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomPortalCode();
    const duplicated = await prisma.$queryRawUnsafe<Array<{ id: number }>>(
      "SELECT id FROM School WHERE portalCode = ? LIMIT 1",
      code,
    );
    if (duplicated.length > 0) continue;
    await prisma.$executeRawUnsafe("UPDATE School SET portalCode = ? WHERE id = ?", code, schoolId);
    return code;
  }
  throw new Error("無法產生園所短碼，請再試一次");
}

// 公開連結 IP 頻率限制：每 IP 每 10 分鐘最多 30 次「失敗」嘗試（成功存取不計）
let accessTableReady = false;
async function ensureAccessTable() {
  if (accessTableReady) return;
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS PortalAccessAttempt (
      key TEXT PRIMARY KEY,
      count INTEGER NOT NULL DEFAULT 0,
      resetAt INTEGER NOT NULL
    )
  `);
  accessTableReady = true;
}

const PORTAL_WINDOW_MS = 10 * 60 * 1000;
const PORTAL_MAX_FAILURES = 30;

export async function portalRateLimited(ip: string): Promise<boolean> {
  if (!ip) return false;
  try {
    await ensureAccessTable();
    const rows = await prisma.$queryRawUnsafe<Array<{ count: number | bigint; resetAt: number | bigint }>>(
      "SELECT count, resetAt FROM PortalAccessAttempt WHERE key = ?", `portal:${ip}`,
    );
    const row = rows[0];
    return Boolean(row && Number(row.resetAt) > Date.now() && Number(row.count) >= PORTAL_MAX_FAILURES);
  } catch { return false; }
}

export async function recordPortalFailure(ip: string, param: string) {
  try {
    await ensureAccessTable();
    const key = `portal:${ip || "unknown"}`;
    const now = Date.now();
    await prisma.$executeRawUnsafe(
      `INSERT INTO PortalAccessAttempt (key, count, resetAt) VALUES (?, 1, ?)
       ON CONFLICT(key) DO UPDATE SET
         count = CASE WHEN resetAt <= ? THEN 1 ELSE count + 1 END,
         resetAt = CASE WHEN resetAt <= ? THEN excluded.resetAt ELSE resetAt END`,
      key, now + PORTAL_WINDOW_MS, now, now,
    );
    // 失敗存取紀錄（不寫入完整 token，只留前 8 碼供比對）
    const { writeAuditLog } = await import("@/lib/auditLog");
    await writeAuditLog(null, {
      actorName: "public", actorRole: "public",
      action: "portal_access_failed", targetType: "SchoolPortal",
      targetLabel: `token前綴:${param.slice(0, 8)}`,
      diffSummary: `公開園所連結驗證失敗（IP: ${ip || "unknown"}）`,
      sensitive: true,
    }).catch(() => undefined);
  } catch { /* 忽略 */ }
}

// req 可選：有帶時啟用 IP 頻率限制與失敗紀錄
export async function resolveSchoolPortalParam(raw: string, req?: { headers: Headers }): Promise<{ schoolId: number }> {
  const param = decodeURIComponent(raw).trim();
  if (!param) throw new Error("Invalid school portal token");
  await ensurePortalColumns();

  const ip = req?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req?.headers.get("x-real-ip") || "";
  if (ip && await portalRateLimited(ip)) throw new Error("嘗試次數過多，請稍後再試");

  const fail = async (message: string): Promise<never> => {
    await recordPortalFailure(ip, param);
    throw new Error(message);
  };

  // 短碼：不含 "."，直接查 School.portalCode
  if (!param.includes(".")) {
    const rows = await prisma.$queryRawUnsafe<Array<{ id: number }>>(
      "SELECT id FROM School WHERE portalCode = ? LIMIT 1",
      param,
    );
    if (rows.length === 0) return fail("Invalid school portal code");
    return { schoolId: Number(rows[0].id) };
  }

  // 舊版 JWT：驗簽 + tokenVersion（重生連結即可讓舊連結立即失效）
  const verified = await verifySchoolPortalToken(param).catch(() => null);
  if (!verified) return fail("Invalid school portal token");
  const rows = await prisma.$queryRawUnsafe<Array<{ portalTokenVersion: number }>>(
    "SELECT portalTokenVersion FROM School WHERE id = ?",
    verified.schoolId,
  );
  if (Number(rows[0]?.portalTokenVersion ?? 0) !== verified.tokenVersion) {
    return fail("Invalid school portal token");
  }
  return { schoolId: verified.schoolId };
}
