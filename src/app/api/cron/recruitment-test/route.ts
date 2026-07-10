import { NextRequest, NextResponse } from "next/server";
import { createRecruitmentCampaign, sendRecruitmentCampaign } from "@/lib/recruitment";

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const teacherName = String(body.teacherName ?? "咕咕瑄").trim();
    const campaign = await createRecruitmentCampaign({
      title: String(body.title ?? "測試：全民招募").trim(),
      regions: String(body.regions ?? "台北、桃園、新竹").trim(),
      courses: String(body.courses ?? "運動、舞蹈、幼兒體能").trim(),
      timeSlots: String(body.timeSlots ?? "平日下午、週末時段").trim(),
      description: String(body.description ?? "這是一筆測試發送，請協助確認 LINE 卡片與推薦表單是否正常。").trim(),
      updatedBy: "cron-test",
    });
    if (!campaign) return NextResponse.json({ error: "建立測試招募失敗" }, { status: 500 });

    const result = await sendRecruitmentCampaign(campaign, { teacherName });
    return NextResponse.json({ ok: result.sent > 0, campaign, ...result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "全民招募測試發送失敗" },
      { status: 400 },
    );
  }
}
