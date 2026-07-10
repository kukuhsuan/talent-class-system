import { NextRequest, NextResponse } from "next/server";
import { listRecruitmentReferrals } from "@/lib/recruitment";
import { BACKOFFICE_ROLES, requireRole } from "@/lib/permissions";

export async function GET(req: NextRequest) {
  const auth = await requireRole(BACKOFFICE_ROLES);
  if (auth.response) return auth.response;

  const { searchParams } = new URL(req.url);
  const rows = await listRecruitmentReferrals({
    campaign: searchParams.get("campaign") ?? "",
    referrer: searchParams.get("referrer") ?? "",
    date: searchParams.get("date") ?? "",
  });
  const response = NextResponse.json(rows);
  response.headers.set("Cache-Control", "no-store");
  return response;
}
