import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLineConfig, pushMessage } from "@/lib/line";
import type { LineRegion } from "@/lib/line";
import { getTeacherLeave, LEAVE_STATUS, markLeaveReviewed } from "@/lib/teacherLeaves";
import { autoSendSubstituteInquiries } from "@/lib/substituteCandidates";
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
    // 操作歷程：誰核准了請假（C-5）
    await writeAuditLog(req, {
      action: "approve",
      targetType: "TeacherLeaveRequest",
      targetId: Number(id),
      targetLabel: leave ? `${leave.leaveDate} ${leave.school} ${leave.courseType}` : `#${id}`,
      beforeData: before ? { status: before.status } : null,
      afterData: { status: LEAVE_STATUS.approved, autoInquiry, pendingSubstitute: pendingResult },
      diffSummary: `核准請假；${pendingResult.changed ? "課堂已標為待指派代課" : `課堂未改動（${pendingResult.reason}）`}；自動詢問代課 ${autoInquiry.sent} 位`,
      sensitive: true,
    });
    return NextResponse.json({ ok: true, autoInquiry, pendingSubstitute: pendingResult });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message || "核准請假失敗" }, { status: 400 });
  }
}
