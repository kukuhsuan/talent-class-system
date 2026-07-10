import { NextRequest, NextResponse } from "next/server";
import { signToken } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/password";
import { ensureUserAccountAuditColumns, writeAuditLog } from "@/lib/auditLog";

const attempts = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 8;

function clientKey(req: NextRequest) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || req.headers.get("x-real-ip")
    || "unknown";
}

function rateLimit(req: NextRequest) {
  const now = Date.now();
  const key = clientKey(req);
  const current = attempts.get(key);
  if (!current || current.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  current.count += 1;
  attempts.set(key, current);
  return current.count > MAX_ATTEMPTS;
}

function clearRateLimit(req: NextRequest) {
  attempts.delete(clientKey(req));
}

export async function POST(req: NextRequest) {
  if (rateLimit(req)) {
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
  // 安全性：不再提供 admin123 開發預設密碼；未設定 ADMIN_PASSWORD 即完全停用共用密碼登入
  const adminPassword = process.env.ADMIN_PASSWORD?.trim() || "";

  // 共用密碼登入：僅在有設定非空 ADMIN_PASSWORD 時允許，避免空密碼直接取得 admin 權限
  if (adminPassword && rawPassword === adminPassword) {
    const token = await signToken({ role: "admin", username: "legacy-admin", name: "系統管理員" });
    const res = NextResponse.json({ ok: true, user: { username: "legacy-admin", name: "系統管理員", role: "admin" } });
    clearRateLimit(req);
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
      clearRateLimit(req);
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
