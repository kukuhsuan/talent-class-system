import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizeDepartment, normalizeRegion } from "@/lib/courseMeta";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await req.json();
  const school = await prisma.school.update({
    where: { id: Number(id) },
    data: {
      name: data.name,
      type: data.type ? normalizeDepartment(data.type) : "",
      region: normalizeRegion(data.region),
      address: data.address ?? "",
      phone: data.phone ?? "",
      contact: data.contact ?? "",
      notes: data.notes ?? "",
      lineUserId: data.lineUserId ?? undefined,
      lineBindCode: data.lineBindCode ?? undefined,
    },
  });
  return NextResponse.json(school);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await prisma.school.delete({ where: { id: Number(id) } });
  return NextResponse.json({ ok: true });
}
