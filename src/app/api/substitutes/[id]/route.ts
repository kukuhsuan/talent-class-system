import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await req.json();
  const record = await prisma.substitute.update({
    where: { id: Number(id) },
    data: { ...data, date: data.date ? new Date(data.date) : undefined },
    include: { originalTeacher: true, substituteTeacher: true },
  });
  return NextResponse.json(record);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await prisma.substitute.delete({ where: { id: Number(id) } });
  return NextResponse.json({ ok: true });
}
