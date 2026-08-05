import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLineConfig, pushMessage } from "@/lib/line";
import type { LineRegion } from "@/lib/line";
import { getTeacherLeave, LEAVE_STATUS, markLeaveReviewed } from "@/lib/teacherLeaves";
import { markAttendancePendingSubstitute } from "@/lib/pendingSubstitute";
import { writeAuditLog } from "@/lib/auditLog";
import { currentSessionUser } from "@/lib/permissions";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const actor = await currentSessionUser();
    const before = await getTeacherLeave(Number(id));
    if (!before) throw new Error("找不到請假申請");
    // 先把課從請假老師身上拿下來、改掛「待排老師」，成功了才改請假單狀態。
    // 順序反過來的話，這一步失敗會留下「假已核准、課卻還算在請假老師頭上」的狀態——
    // 到了月底薪資照發、園所照請款，而那堂課其實沒有人去上。
    const pendingResult = await markAttendancePendingSubstitute(before.attendanceId, before.role, before.teacherId);
    await markLeaveReviewed(Number(id), LEAVE_STATUS.approved, { reviewedBy: actor?.name || "管理端" });
    const leave = await getTeacherLeave(Number(id));
    if (leave) {
      const teacher = await prisma.teacher.findUnique({ where: { id: leave.teacherId } });
      if (teacher?.lineUserId && teacher.lineRegion) {
        await pushMessage(teacher.lineUserId, [{
          type: "text",
          text: `✅ 您的請假申請已核准。\n\n${leave.leaveDate} ${leave.time}\n${leave.school}｜${leave.courseType}\n\n行政會協助安排代課老師。`,
        }], getLineConfig(teacher.lineRegion as LineRegion).token);
      }
      // 這裡刻意不自動發代課詢問。原本核准當下就依「地區＋專長」群發給最多 5 位老師，
      // 但誰適合代這堂課，行政心裡的判斷（跟園所的熟悉度、車程、最近排太滿）系統算不出來，
      // 結果是一核准就有五個人同時收到詢問、多數還得再一一標記已取消，
      // 老師端也被不該找他的課打擾。改由行政在「選老師發詢問」自己挑人送。
    }
    // 操作歷程：誰核准了請假（C-5）
    await writeAuditLog(req, {
      action: "approve",
      targetType: "TeacherLeaveRequest",
      targetId: Number(id),
      targetLabel: leave ? `${leave.leaveDate} ${leave.school} ${leave.courseType}` : `#${id}`,
      beforeData: before ? { status: before.status } : null,
      afterData: { status: LEAVE_STATUS.approved, pendingSubstitute: pendingResult },
      diffSummary: `核准請假；${pendingResult.changed ? "課堂已標為待指派代課" : `課堂未改動（${pendingResult.reason}）`}`,
      sensitive: true,
    });
    return NextResponse.json({ ok: true, pendingSubstitute: pendingResult });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message || "核准請假失敗" }, { status: 400 });
  }
}
