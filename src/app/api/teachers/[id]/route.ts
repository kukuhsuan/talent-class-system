import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await req.json();
  const teacher = await prisma.teacher.update({
    where: { id: Number(id) },
    data: {
      ...data,
      lineUserId: data.lineUserId?.trim() || null,
      lineRegion: data.lineRegion || "",
    },
  });
  return NextResponse.json(teacher);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await prisma.teacher.delete({ where: { id: Number(id) } });
  return NextResponse.json({ ok: true });
}
