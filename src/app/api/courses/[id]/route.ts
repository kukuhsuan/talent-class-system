import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { schoolRel, teacher, ...data } = await req.json();
  void schoolRel; void teacher;
  const course = await prisma.course.update({
    where: { id: Number(id) },
    data: {
      code: data.code,
      region: data.region ?? "",
      teacherId: Number(data.teacherId),
      school: data.school,
      schoolId: data.schoolId ? Number(data.schoolId) : null,
      courseType: data.courseType ?? "",
      dayOfWeek: data.dayOfWeek ?? "",
      time: data.time ?? "",
      category: data.category ?? "課後",
      enrollCount: data.enrollCount ?? "",
      isActive: data.isActive ?? true,
      notes: data.notes ?? "",
    },
    include: { teacher: true },
  });
  return NextResponse.json(course);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await prisma.course.delete({ where: { id: Number(id) } });
  return NextResponse.json({ ok: true });
}
