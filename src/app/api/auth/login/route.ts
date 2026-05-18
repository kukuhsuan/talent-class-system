import { NextRequest, NextResponse } from "next/server";
import { signToken } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/password";

export async function POST(req: NextRequest) {
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
  res.cookies.set("auth-token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });
  return res;
}
