import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const dept = searchParams.get("dept") ?? "";
  const courses = await prisma.course.findMany({
    where: dept ? { department: dept } : {},
    include: { teacher: true, schoolRel: true },
    orderBy: [{ region: "asc" }, { dayOfWeek: "asc" }],
  });
  return NextResponse.json(courses);
}

export async function POST(req: NextRequest) {
  const { schoolRel, teacher, ...data } = await req.json();
  void schoolRel; void teacher;
  const course = await prisma.course.create({
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
      department: data.department ?? "幼兒園",
      enrollCount: data.enrollCount ?? "",
      isActive: data.isActive ?? true,
      notes: data.notes ?? "",
    },
    include: { teacher: true },
  });
  return NextResponse.json(course, { status: 201 });
}
