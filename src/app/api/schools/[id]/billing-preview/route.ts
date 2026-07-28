import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLineConfig, pushMessage } from "@/lib/line";
import type { LineRegion } from "@/lib/line";
import { NOTIFY_ROLES, requireRole, sameOriginOk } from "@/lib/permissions";
import { getOrCreatePortalCode } from "@/lib/schoolPortalAccess";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { response } = await requireRole(NOTIFY_ROLES);
  if (response) return response;
  if (!sameOriginOk(req)) return NextResponse.json({ error: "來源不合法" }, { status: 403 });
  const schoolId = Number((await params).id);
  await prisma.$executeRawUnsafe('ALTER TABLE School ADD COLUMN lineRegion TEXT NOT NULL DEFAULT "school"').catch(() => undefined);
  const school = (await prisma.$queryRawUnsafe<Array<{
    id: number;
    name: string;
    lineUserId: string | null;
    lineRegion: string | null;
  }>>(
    "SELECT id, name, lineUserId, lineRegion FROM School WHERE id = ? LIMIT 1",
    schoolId,
  ))[0];
  if (!school) return NextResponse.json({ error: "找不到園所" }, { status: 404 });
  if (!school.lineUserId) return NextResponse.json({ error: "此園所尚未綁定 LINE，請先完成園所 LINE 綁定" }, { status: 400 });
  const code = await getOrCreatePortalCode(school.id);
  const url = `${req.nextUrl.origin}/school-billing/${code}`;
  const region = (school.lineRegion === "school2" ? "school2" : "school") as LineRegion;
  const config = getLineConfig(region);
  if (!config.token) return NextResponse.json({ error: "園所 LINE 官方帳號尚未完成設定" }, { status: 503 });
  await pushMessage(school.lineUserId, [{
    type: "flex",
    altText: `新合作園所資料填寫｜${school.name}`,
    contents: {
      type: "bubble",
      header: { type: "box", layout: "vertical", backgroundColor: "#315FA8", paddingAll: "18px", contents: [
        { type: "text", text: "新合作園所資料填寫", color: "#FFFFFF", weight: "bold", size: "lg" },
      ] },
      body: { type: "box", layout: "vertical", paddingAll: "18px", spacing: "md", contents: [
        { type: "text", text: `${school.name} 您好`, weight: "bold", color: "#263548", size: "md" },
        { type: "text", text: "為建立首次合作與後續請款資料，請協助填寫正式名稱、發票抬頭、統編與收件信箱。", wrap: true, color: "#68778A", size: "sm" },
        { type: "text", text: "約 1 分鐘即可完成，謝謝！", color: "#68778A", size: "xs" },
      ] },
      footer: { type: "box", layout: "vertical", paddingAll: "14px", contents: [
        { type: "button", style: "primary", color: "#16A34A", action: { type: "uri", label: "填寫園所資料", uri: url } },
      ] },
    },
  }], config.token);
  return NextResponse.json({ ok: true, school: school.name, recipient: "園所綁定人員" });
}
