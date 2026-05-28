import { NextRequest, NextResponse } from "next/server";
import { signToken } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/password";

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
    return NextResponse.json({ error: "登入嘗試次數過多，請稍後再試" }, { status: 429 });
  }

  const { username, password } = await req.json();
  const normalizedUsername = String(username ?? "").trim();
  const rawPassword = String(password ?? "");
  const adminPassword = process.env.ADMIN_PASSWORD ?? "admin123";

  if (normalizedUsername) {
    try {
      const user = await prisma.userAccount.findUnique({ where: { username: normalizedUsername } });
      if (!user || !user.isActive || !(await verifyPassword(rawPassword, user.passwordHash))) {
        return NextResponse.json({ error: "帳號或密碼錯誤" }, { status: 401 });
      }
      const token = await signToken({ role: user.role, userId: user.id, username: user.username, name: user.name });
      const res = NextResponse.json({ ok: true, user: { id: user.id, username: user.username, name: user.name, role: user.role } });
      clearRateLimit(req);
      res.cookies.set("auth-token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 30,
        path: "/",
      });
      return res;
    } catch {
      // If the account table has not been migrated yet, allow legacy password below.
    }
  }

  if (rawPassword !== adminPassword) {
    return NextResponse.json({ error: "帳號或密碼錯誤" }, { status: 401 });
  }

  const token = await signToken({ role: "admin", username: "legacy-admin", name: "系統管理員" });
  const res = NextResponse.json({ ok: true, user: { username: "legacy-admin", name: "系統管理員", role: "admin" } });
  clearRateLimit(req);
  res.cookies.set("auth-token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });
  return res;
}
