import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { BACKOFFICE_ROLES, requireRole } from "@/lib/permissions";
import { ensureCourseRatingTables } from "@/lib/courseRating";

// 後台：重新開放評分（讓安親班可再次填寫）
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(BACKOFFICE_ROLES);
  if (auth.response) return auth.response;
  await ensureCourseRatingTables();
  const { id } = await params;
  const ratingId = Number(id);
  if (!Number.isFinite(ratingId)) return NextResponse.json({ error: "參數錯誤" }, { status: 400 });
  const data = await req.json().catch(() => ({}));
  const action = String(data.action ?? "reopen");
  if (action !== "reopen") return NextResponse.json({ error: "不支援的操作" }, { status: 400 });
  const updated = await prisma.$executeRawUnsafe(
    "UPDATE CourseRating SET status = 'open' WHERE id = ?", ratingId,
  );
  if (!Number(updated)) return NextResponse.json({ error: "找不到這筆評分" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
