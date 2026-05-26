import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await req.json();
  const name = String(data.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "請填寫能力名稱" }, { status: 400 });

  const row = await prisma.skillCard.update({
    where: { id: Number(id) },
    data: {
      name,
      icon: String(data.icon ?? "").trim(),
      imageUrl: String(data.imageUrl ?? "").trim(),
      description: String(data.description ?? "").trim(),
      isActive: data.isActive !== false,
    },
  });
  return NextResponse.json(row);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await prisma.skillCard.delete({ where: { id: Number(id) } });
  return NextResponse.json({ ok: true });
}
