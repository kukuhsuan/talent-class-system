import { NextRequest, NextResponse } from "next/server";
import { writeAuditLog } from "@/lib/auditLog";
import { deleteRecruitmentCampaign, getRecruitmentCampaign } from "@/lib/recruitment";
import { ADMIN_ROLES, requireRole } from "@/lib/permissions";

type Params = { id: string } | Promise<{ id: string }>;

export async function DELETE(req: NextRequest, { params }: { params: Params }) {
  const auth = await requireRole(ADMIN_ROLES);
  if (auth.response) return auth.response;

  const { id } = await params;
  const campaignId = Number(id);
  const before = Number.isFinite(campaignId) ? await getRecruitmentCampaign(campaignId) : null;
  if (!before) return NextResponse.json({ error: "找不到招募訊息" }, { status: 404 });
  if (!before.isActive) return NextResponse.json({ ok: true });

  const deleted = await deleteRecruitmentCampaign(campaignId, auth.user?.name ?? "");
  await writeAuditLog(req, {
    action: "soft_delete",
    targetType: "RecruitmentCampaign",
    targetId: before.id,
    targetLabel: before.title,
    beforeData: before,
    afterData: deleted,
    diffSummary: `刪除招募訊息：${before.title}`,
  });

  return NextResponse.json({ ok: true });
}
