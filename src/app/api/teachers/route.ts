import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const teachers = await prisma.teacher.findMany({ orderBy: { name: "asc" } });
  return NextResponse.json(teachers);
}

export async function POST(req: NextRequest) {
  const data = await req.json();
  const teacher = await prisma.teacher.create({ data });
  return NextResponse.json(teacher, { status: 201 });
}
