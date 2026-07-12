import { NextRequest, NextResponse } from "next/server";
import { requireRole, OWNER_ROLES } from "@/lib/permissions";
import { listLineMessageLogs } from "@/lib/lineMessageLog";

export const dynamic = "force-dynamic";

// LINE 發送紀錄查詢（限主管）：?success=0 只看失敗
export async function GET(req: NextRequest) {
  const { response } = await requireRole(OWNER_ROLES);
  if (response) return response;
  try {
    const successParam = req.nextUrl.searchParams.get("success");
    const items = await listLineMessageLogs({
      success: successParam === null ? undefined : successParam === "1",
      limit: Number(req.nextUrl.searchParams.get("limit")) || 200,
    });
    return NextResponse.json({ items });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message || "紀錄載入失敗" }, { status: 400 });
  }
}
