import { NextResponse } from "next/server";
import { notifySchoolReport } from "@/lib/schoolNotification";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await notifySchoolReport(Number(id));
  return NextResponse.json(result, { status: result.status === "通知失敗" ? 400 : 200 });
}
