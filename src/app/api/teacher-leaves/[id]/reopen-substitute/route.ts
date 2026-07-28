import { NextRequest, NextResponse } from "next/server";
import { getTeacherLeave, reopenLeaveAfterConfirmedSubstituteCancellation } from "@/lib/teacherLeaves";
import { writeAuditLog } from "@/lib/auditLog";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const leaveId = Number((await params).id);
    const leave = await getTeacherLeave(leaveId);
    if (!leave) return NextResponse.json({ error: "找不到請假申請" }, { status: 404 });
    if (leave.isPayrollLocked) return NextResponse.json({ error: "此課程已鎖定薪資，不能重新開放代課" }, { status: 409 });

    const data = await req.json().catch(() => ({}));
    const inquiryId = Number(data.inquiryId);
    const inquiry = leave.inquiries.find((item) => item.id === inquiryId);
    if (!inquiry) return NextResponse.json({ error: "找不到要取消的代課老師紀錄" }, { status: 404 });

    const result = await reopenLeaveAfterConfirmedSubstituteCancellation(inquiryId);
    await writeAuditLog(req, {
      action: "update",
      targetType: "TeacherLeaveRequest",
      targetId: leave.id,
      targetLabel: `${leave.leaveDate} ${leave.school} ${leave.courseType}`,
      beforeData: leave,
      afterData: {
        status: "尋找代課中",
        cancelledInquiryId: inquiryId,
        cancelledSubstituteTeacher: inquiry.candidateTeacherName,
      },
      diffSummary: `代課老師取消：${inquiry.candidateTeacherName}；恢復原老師並重新開放安排`,
      sensitive: true,
    });
    return NextResponse.json({ ok: true, reopened: result.reopened });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message || "重新開放代課失敗" }, { status: 400 });
  }
}
