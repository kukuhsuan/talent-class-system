import { NextRequest, NextResponse } from "next/server";
import { diffSummary, writeAuditLog } from "@/lib/auditLog";
import { createRecruitmentCampaign, listRecruitmentCampaigns } from "@/lib/recruitment";
import { ADMIN_ROLES, BACKOFFICE_ROLES, requireRole } from "@/lib/permissions";

export async function GET() {
  const auth = await requireRole(BACKOFFICE_ROLES);
  if (auth.response) return auth.response;

  return NextResponse.json(await listRecruitmentCampaigns());
}

export async function POST(req: NextRequest) {
  const auth = await requireRole(ADMIN_ROLES);
  if (auth.response) return auth.response;

  const body = await req.json().catch(() => ({}));
  const title = String(body.title ?? "").trim();
  if (!title) return NextResponse.json({ error: "請填寫招募標題" }, { status: 400 });

  const created = await createRecruitmentCampaign({ ...body, updatedBy: auth.user?.name ?? "" });
  if (!created) return NextResponse.json({ error: "建立招募訊息失敗" }, { status: 500 });

  await writeAuditLog(req, {
    action: "create",
    targetType: "RecruitmentCampaign",
    targetId: created.id,
    targetLabel: created.title,
    afterData: created,
    diffSummary: diffSummary(null, created),
  });

  return NextResponse.json(created);
}
