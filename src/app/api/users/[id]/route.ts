import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await req.json();
  const username = String(data.username ?? "").trim();
  const name = String(data.name ?? "").trim();
  const password = String(data.password ?? "");

  if (!username || !name) {
    return NextResponse.json({ error: "請填寫帳號與姓名" }, { status: 400 });
  }

  const updateData: {
    username: string;
    name: string;
    role: string;
    isActive: boolean;
    passwordHash?: string;
  } = {
    username,
    name,
    role: "admin",
    isActive: Boolean(data.isActive),
  };

  if (password) {
    if (password.length < 4) return NextResponse.json({ error: "密碼至少 4 碼" }, { status: 400 });
    updateData.passwordHash = await hashPassword(password);
  }

  const user = await prisma.userAccount.update({
    where: { id: Number(id) },
    data: updateData,
    select: { id: true, username: true, name: true, role: true, isActive: true, createdAt: true },
  });

  return NextResponse.json(user);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await prisma.userAccount.delete({ where: { id: Number(id) } });
  return NextResponse.json({ ok: true });
}
