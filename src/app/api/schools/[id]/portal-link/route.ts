import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensurePortalColumns, getOrCreatePortalCode, rotatePortalCode } from "@/lib/schoolPortalAccess";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const schoolId = Number(id);
  const school = await prisma.school.findUnique({ where: { id: schoolId }, select: { id: true } });
  if (!school) return NextResponse.json({ error: "找不到園所" }, { status: 404 });

  const code = await getOrCreatePortalCode(schoolId);
  return NextResponse.json({
    code,
    url: `${req.nextUrl.origin}/school-portal/${code}`,
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const schoolId = Number(id);
  const school = await prisma.school.findUnique({ where: { id: schoolId }, select: { id: true } });
  if (!school) return NextResponse.json({ error: "找不到園所" }, { status: 404 });

  await ensurePortalColumns();
  // 重生：換短碼 + 舊 JWT 連結一併失效
  await prisma.$executeRawUnsafe(
    "UPDATE School SET portalTokenVersion = COALESCE(portalTokenVersion, 1) + 1 WHERE id = ?",
    schoolId,
  );
  const code = await rotatePortalCode(schoolId);
  return NextResponse.json({
    code,
    rotated: true,
    url: `${req.nextUrl.origin}/school-portal/${code}`,
  }, { headers: { "Cache-Control": "no-store" } });
}
