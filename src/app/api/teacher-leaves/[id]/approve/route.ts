import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLineConfig, pushMessage } from "@/lib/line";
import type { LineRegion } from "@/lib/line";
import { getTeacherLeave, LEAVE_STATUS, markLeaveReviewed } from "@/lib/teacherLeaves";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await markLeaveReviewed(Number(id), LEAVE_STATUS.approved);
    const leave = await getTeacherLeave(Number(id));
    if (leave) {
      const teacher = await prisma.teacher.findUnique({ where: { id: leave.teacherId } });
      if (teacher?.lineUserId && teacher.lineRegion) {
        await pushMessage(teacher.lineUserId, [{
          type: "text",
          text: `✅ 您的請假申請已核准。\n\n${leave.leaveDate} ${leave.time}\n${leave.school}｜${leave.courseType}\n\n行政會協助安排代課老師。`,
        }], getLineConfig(teacher.lineRegion as LineRegion).token);
      }
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message || "核准請假失敗" }, { status: 400 });
  }
}
