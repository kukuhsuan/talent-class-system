import { NextRequest, NextResponse } from "next/server";
import { BACKOFFICE_ROLES, requireRole } from "@/lib/permissions";
import { listSystemAlerts } from "@/lib/systemAlerts";

export async function GET(req: NextRequest) {
  const auth = await requireRole(BACKOFFICE_ROLES);
  if (auth.response) return auth.response;
  try {
    const { searchParams } = new URL(req.url);
    const alerts = await listSystemAlerts({
      status: searchParams.get("status") || undefined,
      level: searchParams.get("level") || undefined,
    });
    return NextResponse.json(alerts);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
