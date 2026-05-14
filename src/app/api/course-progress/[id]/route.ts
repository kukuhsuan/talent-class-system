import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { courseLabel } from "@/lib/courseMeta";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await req.json();
  const row = await prisma.courseProgress.update({
    where: { id: Number(id) },
    data: {
      courseType: courseLabel(data.courseType),
      lesson: Number(data.lesson),
      title: data.title?.trim() ?? "",
    },
  });
  return NextResponse.json(row);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await prisma.courseProgress.delete({ where: { id: Number(id) } });
  return NextResponse.json({ ok: true });
}
