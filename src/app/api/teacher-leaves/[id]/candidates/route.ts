import { NextResponse } from "next/server";
import { getTeacherLeave } from "@/lib/teacherLeaves";
import { listSubstituteCandidates } from "@/lib/substituteCandidates";

const NORTH_REGIONS = new Set(["北部", "台北市", "新北市", "基隆市", "桃園市", "新竹市", "新竹縣"]);

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const leave = await getTeacherLeave(Number(id));
    if (!leave) return NextResponse.json({ error: "找不到請假申請" }, { status: 404 });
    const { items, target } = await listSubstituteCandidates(leave);
    if (!NORTH_REGIONS.has(target.region)) {
      return NextResponse.json({ error: "目前只開放北部課程使用 LINE 代課詢問" }, { status: 409 });
    }
    // 南部 LINE 官方帳號即將停用；代課詢問只顯示已綁定北部官方帳號的老師。
    return NextResponse.json({ items: items.filter((item) => item.lineRegion === "north"), target });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message || "候選老師載入失敗" }, { status: 400 });
  }
}
