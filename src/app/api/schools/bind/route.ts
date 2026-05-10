import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateBindCode } from "@/lib/line";

export async function POST(req: NextRequest) {
  const { schoolId } = await req.json();
  const code = generateBindCode();
  const school = await prisma.school.update({
    where: { id: Number(schoolId) },
    data: { lineBindCode: code },
  });
  return NextResponse.json({ code: school.lineBindCode });
}
