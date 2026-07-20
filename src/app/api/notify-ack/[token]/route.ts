import { NextRequest, NextResponse } from "next/server";
import { getAckInfo, confirmAck } from "@/lib/notifyBatch";

// 「確認收到」公開端點：token 為每人專屬 32 碼亂數，只回姓名與範本名稱
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const info = await getAckInfo(String(token ?? ""));
  if (!info) return NextResponse.json({ error: "連結無效或已失效" }, { status: 404 });
  return NextResponse.json(info);
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const info = await confirmAck(String(token ?? ""));
  if (!info) return NextResponse.json({ error: "連結無效或已失效" }, { status: 404 });
  return NextResponse.json(info);
}
