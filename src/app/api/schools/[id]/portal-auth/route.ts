import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  disablePortalCode,
  generatePortalCode,
  getPortalAuthRow,
  logoutAllDevices,
} from "@/lib/portalAuth";

export const dynamic = "force-dynamic";

// 公司後台：園所驗證碼管理（此路由受後台登入 middleware 保護）
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const schoolId = Number(id);
  const school = await prisma.school.findUnique({ where: { id: schoolId }, select: { id: true } });
  if (!school) return NextResponse.json({ error: "找不到園所" }, { status: 404 });
  const row = await getPortalAuthRow(schoolId);
  return NextResponse.json({
    enabled: Boolean(row?.enabled && row?.codeHash),
    lastVerifiedAt: row?.lastVerifiedAt ?? null,
    failCount: row?.failCount ?? 0,
    lockedUntil: row?.lockedUntil ?? null,
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const schoolId = Number(id);
  const school = await prisma.school.findUnique({ where: { id: schoolId }, select: { id: true, name: true } });
  if (!school) return NextResponse.json({ error: "找不到園所" }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  const action = String(body.action ?? "");

  if (action === "generate") {
    // 產生新驗證碼（舊碼立即失效），明碼只回傳這一次
    const code = await generatePortalCode(schoolId);
    return NextResponse.json({ ok: true, code });
  }
  if (action === "disable") {
    await disablePortalCode(schoolId);
    return NextResponse.json({ ok: true });
  }
  if (action === "logoutAll") {
    await logoutAllDevices(schoolId);
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "不支援的操作" }, { status: 400 });
}
