import { NextRequest, NextResponse } from "next/server";
import { ABILITY_ICON_MAP, normalizeAbility } from "@/lib/abilityMap";
import { prisma } from "@/lib/prisma";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await req.json();
  const name = normalizeAbility(String(data.name ?? ""));
  if (!name) return NextResponse.json({ error: "能力名稱只允許固定 8 種核心能力" }, { status: 400 });

  const row = await prisma.skillCard.update({
    where: { id: Number(id) },
    data: {
      name,
      icon: "",
      imageUrl: ABILITY_ICON_MAP[name],
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
