import { NextRequest, NextResponse } from "next/server";
import { writeAuditLog } from "@/lib/auditLog";
import { prisma } from "@/lib/prisma";
import { getTeacherLeave } from "@/lib/teacherLeaves";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const leaveId = Number((await params).id);
    const leave = await getTeacherLeave(leaveId);
    if (!leave) return NextResponse.json({ error: "找不到請假申請" }, { status: 404 });

    const data = await req.json().catch(() => ({}));
    const inquiryId = Number(data.inquiryId);
    const inquiry = leave.inquiries.find((item) => item.id === inquiryId);
    if (!inquiry) return NextResponse.json({ error: "找不到老師回覆紀錄" }, { status: 404 });
    if (leave.confirmedSubstituteTeacherId === inquiry.candidateTeacherId) {
      return NextResponse.json(
        { error: "此老師目前仍是正式代課，請使用「取消此代課並重找」" },
        { status: 409 },
      );
    }

    await prisma.$executeRawUnsafe(
      `UPDATE "SubstituteInquiry"
       SET "status" = 'cancelled', "respondedAt" = CURRENT_TIMESTAMP
       WHERE "id" = ? AND "leaveRequestId" = ?`,
      inquiryId,
      leaveId,
    );

    await writeAuditLog(req, {
      action: "update",
      targetType: "SubstituteInquiry",
      targetId: inquiryId,
      targetLabel: `${leave.leaveDate} ${leave.school}｜${inquiry.candidateTeacherName}`,
      beforeData: { status: inquiry.status },
      afterData: { status: "cancelled" },
      diffSummary: `補登老師取消代課：${inquiry.candidateTeacherName}`,
      sensitive: true,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message || "標記取消代課失敗" }, { status: 400 });
  }
}
