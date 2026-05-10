import { NextRequest, NextResponse } from "next/server";
import { signToken } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const { password } = await req.json();
  const adminPassword = process.env.ADMIN_PASSWORD ?? "admin123";

  if (password !== adminPassword) {
    return NextResponse.json({ error: "密碼錯誤" }, { status: 401 });
  }

  const token = await signToken({ role: "admin" });
  const res = NextResponse.json({ ok: true });
  res.cookies.set("auth-token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });
  return res;
}
