import { NextResponse } from "next/server";
import { getTeacherLeave } from "@/lib/teacherLeaves";
import { listSubstituteCandidates } from "@/lib/substituteCandidates";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const leave = await getTeacherLeave(Number(id));
    if (!leave) return NextResponse.json({ error: "找不到請假申請" }, { status: 404 });
    const { items, target } = await listSubstituteCandidates(leave);
    return NextResponse.json({ items, target });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message || "候選老師載入失敗" }, { status: 400 });
  }
}
