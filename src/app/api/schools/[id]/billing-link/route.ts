import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrCreatePortalCode } from "@/lib/schoolPortalAccess";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const schoolId = Number((await params).id);
  const school = await prisma.school.findUnique({ where: { id: schoolId }, select: { id: true } });
  if (!school) return NextResponse.json({ error: "找不到園所" }, { status: 404 });
  const code = await getOrCreatePortalCode(schoolId);
  return NextResponse.json({ url: `${req.nextUrl.origin}/school-billing/${code}` }, { headers: { "Cache-Control": "no-store" } });
}
