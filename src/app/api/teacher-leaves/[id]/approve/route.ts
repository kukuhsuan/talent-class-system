import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLineConfig, pushMessage } from "@/lib/line";
import type { LineRegion } from "@/lib/line";
import { getTeacherLeave, LEAVE_STATUS, markLeaveReviewed } from "@/lib/teacherLeaves";
import { autoSendSubstituteInquiries } from "@/lib/substituteCandidates";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await markLeaveReviewed(Number(id), LEAVE_STATUS.approved);
    const leave = await getTeacherLeave(Number(id));
    let autoInquiry: { sent: number; skipped: number; asked: string[]; reason: string } = { sent: 0, skipped: 0, asked: [], reason: "" };
    if (leave) {
      const teacher = await prisma.teacher.findUnique({ where: { id: leave.teacherId } });
      if (teacher?.lineUserId && teacher.lineRegion) {
        await pushMessage(teacher.lineUserId, [{
          type: "text",
          text: `✅ 您的請假申請已核准。\n\n${leave.leaveDate} ${leave.time}\n${leave.school}｜${leave.courseType}\n\n行政會協助安排代課老師。`,
        }], getLineConfig(teacher.lineRegion as LineRegion).token);
      }
      // 核准後自動依「地區＋專長」詢問代課老師（失敗不影響核准結果）
      try {
        autoInquiry = await autoSendSubstituteInquiries(leave);
      } catch (error) {
        autoInquiry = { sent: 0, skipped: 0, asked: [], reason: (error as Error).message || "自動詢問失敗" };
      }
    }
    return NextResponse.json({ ok: true, autoInquiry });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message || "核准請假失敗" }, { status: 400 });
  }
}
