import { NextRequest, NextResponse } from "next/server";
import { getRatingByToken, ratingSchoolId } from "@/lib/courseRating";
import { createPortalSessionCookie, verifyPortalCode } from "@/lib/portalAuth";

export const dynamic = "force-dynamic";

// 評分頁的園所驗證：由評分 token 反查園所，驗證成功後發放同一組裝置 Session
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const rating = await getRatingByToken(token);
    if (!rating) return NextResponse.json({ error: "找不到這個評分連結" }, { status: 404 });
    const schoolId = await ratingSchoolId(rating.attendanceId);
    if (!schoolId) return NextResponse.json({ error: "找不到這堂課的園所資料" }, { status: 404 });
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
