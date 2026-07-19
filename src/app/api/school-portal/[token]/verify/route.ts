import { NextRequest, NextResponse } from "next/server";
import { resolveSchoolPortalParam } from "@/lib/schoolPortalAccess";
import { createPortalSessionCookie, hasValidPortalSession, verifyPortalCode } from "@/lib/portalAuth";

export const dynamic = "force-dynamic";

// 查詢目前裝置是否已通過園所驗證
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const { schoolId } = await resolveSchoolPortalParam(token, req);
    return NextResponse.json({ verified: await hasValidPortalSession(req, schoolId) }, {
      headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" },
    });
  } catch {
    return NextResponse.json({ error: "園所連結無效或已過期" }, { status: 401 });
  }
}

// 輸入 6 位數園所驗證碼 → 發放裝置 Session Cookie
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const { schoolId } = await resolveSchoolPortalParam(token, req);
    const body = await req.json().catch(() => ({}));
    const result = await verifyPortalCode(schoolId, String(body.code ?? ""));
    if (!result.ok) return NextResponse.json({ error: result.error, locked: result.locked ?? false }, { status: 401 });
    const cookie = await createPortalSessionCookie(schoolId, body.remember !== false);
    const res = NextResponse.json({ ok: true });
    res.cookies.set(cookie.name, cookie.value, cookie.options);
    return res;
  } catch {
    return NextResponse.json({ error: "驗證失敗，請稍後再試" }, { status: 400 });
  }
}
