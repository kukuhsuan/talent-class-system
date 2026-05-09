import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const courses = await prisma.course.findMany({
    include: { teacher: true },
    orderBy: [{ region: "asc" }, { dayOfWeek: "asc" }],
  });
  return NextResponse.json(courses);
}

export async function POST(req: NextRequest) {
  const data = await req.json();
  const course = await prisma.course.create({ data, include: { teacher: true } });
  return NextResponse.json(course, { status: 201 });
}
