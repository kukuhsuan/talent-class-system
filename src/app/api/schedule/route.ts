import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const region = searchParams.get("region") ?? "";

  const dept = searchParams.get("dept") ?? "";

  const courses = await prisma.course.findMany({
    where: {
      isActive: true,
      ...(region ? { region } : {}),
      ...(dept ? { department: dept } : {}),
    },
    include: { teacher: true },
    orderBy: [{ region: "asc" }, { school: "asc" }, { dayOfWeek: "asc" }],
  });

  return NextResponse.json(courses);
}
