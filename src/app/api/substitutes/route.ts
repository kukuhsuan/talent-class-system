import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const records = await prisma.substitute.findMany({
    include: { originalTeacher: true, substituteTeacher: true },
    orderBy: { date: "desc" },
  });
  return NextResponse.json(records);
}

export async function POST(req: NextRequest) {
  const data = await req.json();
  const record = await prisma.substitute.create({
    data: { ...data, date: new Date(data.date) },
    include: { originalTeacher: true, substituteTeacher: true },
  });
  return NextResponse.json(record, { status: 201 });
}
