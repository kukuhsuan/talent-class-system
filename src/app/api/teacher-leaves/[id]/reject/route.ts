import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLineConfig, pushMessage } from "@/lib/line";
import type { LineRegion } from "@/lib/line";
import { getTeacherLeave, LEAVE_STATUS, markLeaveReviewed } from "@/lib/teacherLeaves";
import { writeAuditLog } from "@/lib/auditLog";
import { currentSessionUser } from "@/lib/permissions";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const data = await req.json().catch(() => ({}));
    const reason = String(data.reason ?? "").trim();
    const actor = await currentSessionUser();
    const before = await getTeacherLeave(Number(id));
    await markLeaveReviewed(Number(id), LEAVE_STATUS.rejected, {
      rejectedReason: reason,
      reviewedBy: actor?.name || "管理端",
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
    // 操作歷程：誰駁回了請假（C-5）
    await writeAuditLog(req, {
      action: "reject",
      targetType: "TeacherLeaveRequest",
      targetId: Number(id),
      targetLabel: leave ? `${leave.leaveDate} ${leave.school} ${leave.courseType}` : `#${id}`,
      beforeData: before ? { status: before.status } : null,
      afterData: { status: LEAVE_STATUS.rejected, reason },
      diffSummary: `駁回請假${reason ? `：${reason}` : ""}`,
      sensitive: true,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message || "駁回請假失敗" }, { status: 400 });
  }
}
