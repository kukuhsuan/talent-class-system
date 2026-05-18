import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";

export async function GET() {
  const users = await prisma.userAccount.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, username: true, name: true, role: true, isActive: true, createdAt: true },
  });
  return NextResponse.json(users);
}

export async function POST(req: NextRequest) {
  const data = await req.json();
  const username = String(data.username ?? "").trim();
  const name = String(data.name ?? "").trim();
  const password = String(data.password ?? "");

  if (!username || !name || password.length < 4) {
    return NextResponse.json({ error: "請填寫帳號、姓名，密碼至少 4 碼" }, { status: 400 });
  }

  const user = await prisma.userAccount.create({
    data: {
      username,
      name,
      passwordHash: await hashPassword(password),
      role: "admin",
      isActive: data.isActive ?? true,
    },
    select: { id: true, username: true, name: true, role: true, isActive: true, createdAt: true },
  });

  return NextResponse.json(user, { status: 201 });
}
