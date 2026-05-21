import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { signSchoolPortalToken } from "@/lib/schoolPortalToken";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const schoolId = Number(id);
  const school = await prisma.school.findUnique({ where: { id: schoolId }, select: { id: true } });
  if (!school) return NextResponse.json({ error: "找不到園所" }, { status: 404 });

  const token = await signSchoolPortalToken(schoolId);
  return NextResponse.json({
    token,
    url: `${req.nextUrl.origin}/school-portal/${encodeURIComponent(token)}`,
  });
}
