import { NextRequest, NextResponse } from "next/server";
import { readAuditLogs } from "@/lib/auditLog";
import { OWNER_ROLES, requireRole } from "@/lib/permissions";

export async function GET(req: NextRequest) {
  const auth = await requireRole(OWNER_ROLES);
  if (auth.response) return auth.response;
  const { searchParams } = new URL(req.url);
  const result = await readAuditLogs({
    actor: searchParams.get("actor") ?? "",
    action: searchParams.get("action") ?? "",
    targetType: searchParams.get("targetType") ?? "",
    keyword: searchParams.get("keyword") ?? "",
    sensitive: searchParams.get("sensitive") === "1",
    from: searchParams.get("from") ?? "",
    to: searchParams.get("to") ?? "",
    page: Number(searchParams.get("page") ?? "1") || 1,
    pageSize: Number(searchParams.get("pageSize") ?? "50") || 50,
  });
  return NextResponse.json(result);
}

