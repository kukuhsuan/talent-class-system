import { NextRequest, NextResponse } from "next/server";
import { signToken } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/password";
import { ensureUserAccountAuditColumns, writeAuditLog } from "@/lib/auditLog";

// 登入頻率限制改為資料庫持久化：Vercel serverless 重啟後仍有效
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 8;

function clientKey(req: NextRequest) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || req.headers.get("x-real-ip")
    || "unknown";
}

let rateTableReady = false;
async function ensureRateTable() {
  if (rateTableReady) return;
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS LoginRateLimit (
      key TEXT PRIMARY KEY,
      count INTEGER NOT NULL DEFAULT 0,
      resetAt INTEGER NOT NULL
    )
  `);
  rateTableReady = true;
}

async function rateLimit(req: NextRequest) {
  try {
    await ensureRateTable();
    const key = clientKey(req);
    const now = Date.now();
    const rows = await prisma.$queryRawUnsafe<Array<{ count: number | bigint; resetAt: number | bigint }>>(
      "SELECT count, resetAt FROM LoginRateLimit WHERE key = ?", key,
    );
    const current = rows[0];
    if (!current || Number(current.resetAt) <= now) {
      await prisma.$executeRawUnsafe(
        "INSERT INTO LoginRateLimit (key, count, resetAt) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET count = 1, resetAt = excluded.resetAt",
        key, now + WINDOW_MS,
      );
      return false;
    }
    await prisma.$executeRawUnsafe("UPDATE LoginRateLimit SET count = count + 1 WHERE key = ?", key);
    return Number(current.count) + 1 > MAX_ATTEMPTS;
  } catch {
    return false; // 資料庫暫時異常不擋登入，仍有密碼驗證保護
  }
}

async function clearRateLimit(req: NextRequest) {
  try {
    await ensureRateTable();
    await prisma.$executeRawUnsafe("DELETE FROM LoginRateLimit WHERE key = ?", clientKey(req));
  } catch { /* 忽略 */ }
}

export async function POST(req: NextRequest) {
  if (await rateLimit(req)) {
    await writeAuditLog(req, {
      action: "login",
      targetType: "UserAccount",
      targetLabel: "登入嘗試",
      diffSummary: "登入嘗試次數過多",
      sensitive: true,
    });
    return NextResponse.json({ error: "登入嘗試次數過多，請稍後再試" }, { status: 429 });
  }

  const { username, password } = await req.json();
  const normalizedUsername = String(username ?? "").trim();
  const rawPassword = String(password ?? "");
  // 安全性：正式環境停用共用 ADMIN_PASSWORD（無法追責到個人）。
  // 僅開發環境、或明確設定 ALLOW_LEGACY_LOGIN=1 時允許（過渡期用，建議盡快移除）。
  const legacyAllowed = process.env.NODE_ENV !== "production" || process.env.ALLOW_LEGACY_LOGIN === "1";
  const adminPassword = legacyAllowed ? (process.env.ADMIN_PASSWORD?.trim() || "") : "";

  if (adminPassword && rawPassword === adminPassword) {
    const token = await signToken({ role: "admin", username: "legacy-admin", name: "系統管理員" });
    const res = NextResponse.json({ ok: true, user: { username: "legacy-admin", name: "系統管理員", role: "admin" } });
    await clearRateLimit(req);
    await writeAuditLog(req, {
      actorName: "系統管理員",
      actorRole: "admin",
      action: "login",
      targetType: "UserAccount",
      targetLabel: "legacy-admin",
      diffSummary: "【警告】共用後台密碼登入成功（無法追責到個人，建議改用個人帳號並停用 ADMIN_PASSWORD）",
      sensitive: true,
    });
    res.cookies.set("auth-token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7,
      path: "/",
    });
    return res;
  }

  if (normalizedUsername) {
    try {
      await ensureUserAccountAuditColumns();
      const user = await prisma.userAccount.findUnique({ where: { username: normalizedUsername } });
      if (!user || !user.isActive || !(await verifyPassword(rawPassword, user.passwordHash))) {
        await writeAuditLog(req, {
          actorName: normalizedUsername,
          action: "login",
          targetType: "UserAccount",
          targetLabel: normalizedUsername,
          diffSummary: "登入失敗",
          sensitive: true,
        });
        return NextResponse.json({ error: "帳號或密碼錯誤" }, { status: 401 });
      }
      const token = await signToken({ role: user.role, userId: user.id, username: user.username, name: user.name });
      const res = NextResponse.json({ ok: true, user: { id: user.id, username: user.username, name: user.name, role: user.role } });
      await clearRateLimit(req);
      await prisma.userAccount.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } }).catch(() => undefined);
      await writeAuditLog(req, {
        actorUserId: user.id,
        actorName: user.name,
        actorRole: user.role,
        action: "login",
        targetType: "UserAccount",
        targetId: user.id,
        targetLabel: user.name,
        diffSummary: "登入成功",
        sensitive: true,
      });
      res.cookies.set("auth-token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 7,
        path: "/",
      });
      return res;
    } catch {
      // If the account table has not been migrated yet, allow legacy password below.
    }
  }

  await writeAuditLog(req, {
    actorName: normalizedUsername || "未知帳號",
    action: "login",
    targetType: "UserAccount",
    targetLabel: normalizedUsername || "未輸入帳號",
    diffSummary: "登入失敗",
    sensitive: true,
  });
  return NextResponse.json({ error: "帳號或密碼錯誤" }, { status: 401 });
}
