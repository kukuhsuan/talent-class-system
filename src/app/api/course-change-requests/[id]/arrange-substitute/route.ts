import { NextRequest, NextResponse } from "next/server";
import { ADMIN_ROLES, requireRole } from "@/lib/permissions";
import { getCourseChangeRequest } from "@/lib/courseChangeRequests";
import { createLeaveRequestFromAttendance } from "@/lib/teacherLeaves";
import { writeAuditLog } from "@/lib/auditLog";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(ADMIN_ROLES);
  if (auth.response || !auth.user) return auth.response;
  const { id } = await params;
  try {
    const request = await getCourseChangeRequest(Number(id));
    if (!request) return NextResponse.json({ error: "找不到課程異動申請" }, { status: 404 });
    if (request.status !== "老師無法配合") throw new Error("只有老師無法配合時可以安排代課");
    const leave = await createLeaveRequestFromAttendance({
      attendanceId: request.primaryAttendanceId,
      teacherId: request.teacherId,
      reason: "課程異動後原老師無法配合",
      notes: `由課程異動申請 #${request.id} 建立`,
    });
    await writeAuditLog(req, {
      action: "create",
      targetType: "TeacherLeaveRequest",
      targetId: leave.id,
      targetLabel: `${request.originalSchoolName} ${request.course.courseType}`,
      afterData: leave,
      diffSummary: `由課程異動申請 #${request.id} 建立代課安排`,
      sensitive: true,
    });
    return NextResponse.json({ ok: true, leaveRequestId: leave.id });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message || "建立代課安排失敗" }, { status: 400 });
  }
}
