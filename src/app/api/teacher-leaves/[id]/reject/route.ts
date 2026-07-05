import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLineConfig, pushMessage } from "@/lib/line";
import type { LineRegion } from "@/lib/line";
import { getTeacherLeave, LEAVE_STATUS, markLeaveReviewed } from "@/lib/teacherLeaves";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const data = await req.json().catch(() => ({}));
    const reason = String(data.reason ?? "").trim();
    await markLeaveReviewed(Number(id), LEAVE_STATUS.rejected, {
      rejectedReason: reason,
    });
    const leave = await getTeacherLeave(Number(id));
    if (leave) {
      const teacher = await prisma.teacher.findUnique({ where: { id: leave.teacherId } });
      if (teacher?.lineUserId && teacher.lineRegion) {
        await pushMessage(teacher.lineUserId, [{
          type: "text",
          text: `❌ 您的請假申請未核准。\n\n${leave.leaveDate} ${leave.time}\n${leave.school}｜${leave.courseType}${reason ? `\n\n原因：${reason}` : ""}\n\n如需協助，請再聯繫行政。`,
        }], getLineConfig(teacher.lineRegion as LineRegion).token);
      }
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message || "駁回請假失敗" }, { status: 400 });
  }
}
