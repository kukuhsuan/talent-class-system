import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createRecruitmentReferral, getRecruitmentCampaign } from "@/lib/recruitment";
import { verifyRecruitmentToken } from "@/lib/publicAccessToken";

type Params = { token: string } | Promise<{ token: string }>;

async function context(token: string) {
  const verified = verifyRecruitmentToken(decodeURIComponent(token));
  const [campaign, teacher] = await Promise.all([
    getRecruitmentCampaign(verified.campaignId),
    prisma.teacher.findUnique({ where: { id: verified.teacherId }, select: { id: true, name: true } }),
  ]);
  if (!campaign || !teacher) throw new Error("找不到招募或推薦老師資料");
  if (!campaign.isActive) throw new Error("這個招募已關閉");
  return { campaign, teacher };
}

export async function GET(_req: NextRequest, { params }: { params: Params }) {
  try {
    const { token } = await params;
    const data = await context(token);
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message || "推薦連結無效" }, { status: 401 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Params }) {
  try {
    const { token } = await params;
    const { campaign, teacher } = await context(token);
    const body = await req.json().catch(() => ({}));
    const candidateName = String(body.candidateName ?? "").trim();
    const candidatePhone = String(body.candidatePhone ?? "").trim();
    if (!candidateName) return NextResponse.json({ error: "請填寫被推薦老師姓名" }, { status: 400 });
    if (!candidatePhone) return NextResponse.json({ error: "請填寫被推薦老師電話" }, { status: 400 });

    await createRecruitmentReferral({
      campaignId: campaign.id,
      referrerTeacherId: teacher.id,
      candidateName,
      candidatePhone,
      notes: String(body.notes ?? "").trim(),
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message || "推薦送出失敗" }, { status: 400 });
  }
}
