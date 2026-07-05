import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { signSchoolPortalTokenWithVersion } from "@/lib/schoolPortalToken";

export const dynamic = "force-dynamic";

async function ensurePortalTokenVersionColumn() {
  try {
    await prisma.$executeRawUnsafe('ALTER TABLE School ADD COLUMN portalTokenVersion INTEGER NOT NULL DEFAULT 1');
  } catch {
    // Column already exists.
  }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const schoolId = Number(id);
  const school = await prisma.school.findUnique({ where: { id: schoolId }, select: { id: true } });
  if (!school) return NextResponse.json({ error: "找不到園所" }, { status: 404 });

  await ensurePortalTokenVersionColumn();
  const rows = await prisma.$queryRawUnsafe<Array<{ portalTokenVersion: number }>>(
    "SELECT portalTokenVersion FROM School WHERE id = ?",
    schoolId,
  );
  const currentVersion = Number(rows[0]?.portalTokenVersion ?? 1);

  const token = await signSchoolPortalTokenWithVersion(schoolId, currentVersion);
  return NextResponse.json({
    token,
    url: `${req.nextUrl.origin}/school-portal/${encodeURIComponent(token)}`,
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const schoolId = Number(id);
  const school = await prisma.school.findUnique({ where: { id: schoolId }, select: { id: true } });
  if (!school) return NextResponse.json({ error: "找不到園所" }, { status: 404 });

  await ensurePortalTokenVersionColumn();
  await prisma.$executeRawUnsafe(
    "UPDATE School SET portalTokenVersion = COALESCE(portalTokenVersion, 1) + 1 WHERE id = ?",
    schoolId,
  );
  const rows = await prisma.$queryRawUnsafe<Array<{ portalTokenVersion: number }>>(
    "SELECT portalTokenVersion FROM School WHERE id = ?",
    schoolId,
  );
  const currentVersion = Number(rows[0]?.portalTokenVersion ?? 1);

  const token = await signSchoolPortalTokenWithVersion(schoolId, currentVersion);
  return NextResponse.json({
    token,
    rotated: true,
    url: `${req.nextUrl.origin}/school-portal/${encodeURIComponent(token)}`,
  }, { headers: { "Cache-Control": "no-store" } });
}
