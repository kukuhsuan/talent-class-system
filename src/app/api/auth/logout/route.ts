import { NextRequest, NextResponse } from "next/server";
import { writeAuditLog } from "@/lib/auditLog";

export async function POST(req: NextRequest) {
  await writeAuditLog(req, {
    action: "logout",
    targetType: "UserAccount",
    diffSummary: "登出",
    sensitive: true,
  });
  const res = NextResponse.json({ ok: true });
  res.cookies.set("auth-token", "", { maxAge: 0, path: "/" });
  return res;
}
