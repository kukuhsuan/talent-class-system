import { NextRequest, NextResponse } from "next/server";
import { writeAuditLog } from "@/lib/auditLog";
import { getRecruitmentCampaign, sendRecruitmentCampaign } from "@/lib/recruitment";
import { ADMIN_ROLES, requireRole } from "@/lib/permissions";

type Params = { id: string } | Promise<{ id: string }>;

export async function POST(req: NextRequest, { params }: { params: Params }) {
  const auth = await requireRole(ADMIN_ROLES);
  if (auth.response) return auth.response;

  const { id } = await params;
  const campaignId = Number(id);
  const campaign = Number.isFinite(campaignId) ? await getRecruitmentCampaign(campaignId) : null;
  if (!campaign) return NextResponse.json({ error: "找不到招募訊息" }, { status: 404 });
  if (!campaign.isActive) return NextResponse.json({ error: "這個招募已刪除，無法發送" }, { status: 400 });

  const result = await sendRecruitmentCampaign(campaign);
  await writeAuditLog(req, {
    action: "send_line",
    targetType: "RecruitmentCampaign",
    targetId: campaign.id,
    targetLabel: campaign.title,
    afterData: result,
    diffSummary: `全民招募發送：${campaign.title}，成功 ${result.sent} 位，失敗 ${result.failed} 位`,
  });

  return NextResponse.json({ ok: true, ...result });
}
