import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateBindCode } from "@/lib/line";

// POST: generate or reset bind code for a teacher
export async function POST(req: NextRequest) {
  const { teacherId } = await req.json();
  const code = generateBindCode();
  const teacher = await prisma.teacher.update({
    where: { id: Number(teacherId) },
    data: { lineBindCode: code },
  });
  return NextResponse.json({ code: teacher.lineBindCode });
}
