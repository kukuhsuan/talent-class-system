import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLineConfig, pushMessage } from "@/lib/line";
import type { LineRegion } from "@/lib/line";
import { getTeacherLeave, LEAVE_STATUS, markLeaveReviewed } from "@/lib/teacherLeaves";
import { writeAuditLog } from "@/lib/auditLog";
import { currentSessionUser } from "@/lib/permissions";
import { restoreAttendanceTeacher } from "@/lib/pendingSubstitute";

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
    // 駁回＝老師還是要去上這堂課，把先前標成「待排老師」的課堂還給他。
    // （核准後又改判駁回的情況；一開始就駁回的話這裡會判斷出課堂沒被動過而跳過。）
    const restored = leave
      ? await restoreAttendanceTeacher(leave.attendanceId, leave.role, leave.teacherId)
      : { changed: false, reason: "找不到請假申請" };
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
      afterData: { status: LEAVE_STATUS.rejected, reason, restoreTeacher: restored },
      diffSummary: `駁回請假${reason ? `：${reason}` : ""}${restored.changed ? "；課堂已還給原老師" : ""}`,
      sensitive: true,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message || "駁回請假失敗" }, { status: 400 });
  }
}
