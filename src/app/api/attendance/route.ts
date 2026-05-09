import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const year = searchParams.get("year");
  const month = searchParams.get("month");

  const where: Record<string, unknown> = {};
  if (year && month) {
    const start = new Date(Number(year), Number(month) - 1, 1);
    const end = new Date(Number(year), Number(month), 1);
    where.date = { gte: start, lt: end };
  }

  const records = await prisma.attendance.findMany({
    where,
    include: { course: true, actualTeacher: true },
    orderBy: { date: "desc" },
  });
  return NextResponse.json(records);
}

export async function POST(req: NextRequest) {
  const data = await req.json();
  const record = await prisma.attendance.create({
    data: { ...data, date: new Date(data.date) },
    include: { course: true, actualTeacher: true },
  });
  return NextResponse.json(record, { status: 201 });
}
