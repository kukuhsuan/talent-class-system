import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ role: null }, { status: 401 });
  return NextResponse.json({
    role: String(session.role ?? ""),
    name: String(session.name ?? ""),
    username: String(session.username ?? ""),
  });
}
