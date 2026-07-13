import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ADMIN_ROLES, BACKOFFICE_ROLES, requireRole } from "@/lib/permissions";
import { addCourseChangeEvent, COURSE_CHANGE_STATUS, courseChangeDisplay, courseChangeInclude, getCourseChangeRequest, parseChangeTypes } from "@/lib/courseChangeRequests";
import { diffSummary, writeAuditLog } from "@/lib/auditLog";
import { databaseErrorMessage, withDatabaseRetry } from "@/lib/databaseRetry";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(BACKOFFICE_ROLES);
  if (auth.response) return auth.response;
  const { id } = await params;
  const item = await withDatabaseRetry(() => getCourseChangeRequest(Number(id)));
  if (!item) return NextResponse.json({ error: "找不到課程異動申請" }, { status: 404 });
  return NextResponse.json(courseChangeDisplay(item));
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(ADMIN_ROLES);
  if (auth.response || !auth.user) return auth.response;
  const { id } = await params;
  const requestId = Number(id);
  try {
    const current = await withDatabaseRetry(() => getCourseChangeRequest(requestId));
    if (!current) return NextResponse.json({ error: "找不到課程異動申請" }, { status: 404 });
    const body = await req.json();
    const action = String(body.action ?? "update");
    if ([COURSE_CHANGE_STATUS.completed, COURSE_CHANGE_STATUS.cancelled].includes(current.status as never)) throw new Error("已完成或已取消的申請不可修改");

    let data: Parameters<typeof prisma.courseChangeRequest.update>[0]["data"] = {};
    let nextStatus = current.status;
    let actionLabel = "行政修改申請";
    if (action === "cancel") {
      nextStatus = COURSE_CHANGE_STATUS.cancelled;
      data = { status: nextStatus, cancelledAt: new Date(), reviewNote: String(body.note ?? "") };
      actionLabel = "取消異動申請";
    } else if (action === "return") {
      if (current.requestSource !== "SCHOOL") throw new Error("只有園所建立的申請可以退回補充");
      nextStatus = COURSE_CHANGE_STATUS.cancelled;
      data = { status: nextStatus, returnedAt: new Date(), cancelledAt: new Date(), reviewNote: String(body.note ?? "請補充資料後重新送出申請") };
      actionLabel = "退回園所重新填寫";
    } else {
      if (current.status !== COURSE_CHANGE_STATUS.pendingReview && current.status !== COURSE_CHANGE_STATUS.draft) throw new Error("已發送老師的申請不可直接修改，請先取消後重建");
      const types = parseChangeTypes(body.changeTypes ?? current.changeTypes);
      if (types.length === 0) throw new Error("請至少選擇一種異動類型");
      data = {
        changeTypes: JSON.stringify(types),
        newDate: body.newDate ? new Date(`${String(body.newDate).slice(0, 10)}T00:00:00.000Z`) : null,
        newStartTime: String(body.newStartTime ?? current.newStartTime),
        newEndTime: String(body.newEndTime ?? current.newEndTime),
        newSchoolId: body.newSchoolId ? Number(body.newSchoolId) : null,
        newSchoolName: String(body.newSchoolName ?? current.newSchoolName),
        newAddress: String(body.newAddress ?? current.newAddress),
        newLocation: String(body.newLocation ?? current.newLocation),
        newStudentCount: body.newStudentCount === undefined
          ? current.newStudentCount
          : body.newStudentCount === null || body.newStudentCount === ""
            ? null
            : Number(body.newStudentCount),
        reasonType: String(body.reasonType ?? current.reasonType),
        reasonNote: String(body.reasonNote ?? current.reasonNote),
        reviewNote: "",
        returnedAt: null,
        status: COURSE_CHANGE_STATUS.pendingReview,
      };
      nextStatus = COURSE_CHANGE_STATUS.pendingReview;
    }
    const updated = await withDatabaseRetry(() => prisma.$transaction(async (tx) => {
      const row = await tx.courseChangeRequest.update({ where: { id: requestId }, data });
      await addCourseChangeEvent(tx, {
        requestId,
        actorType: "admin",
        actorId: auth.user!.userId,
        actorName: auth.user!.name,
        action: actionLabel,
        fromStatus: current.status,
        toStatus: nextStatus,
        note: String(body.note ?? ""),
        beforeData: current,
        afterData: row,
      });
      return tx.courseChangeRequest.findUniqueOrThrow({ where: { id: requestId }, include: courseChangeInclude });
    }));
    await writeAuditLog(req, {
      action: action === "cancel" ? "soft_delete" : "update",
      targetType: "CourseChangeRequest",
      targetId: requestId,
      targetLabel: `${current.originalSchoolName} ${current.course.courseType}`,
      beforeData: current,
      afterData: updated,
      diffSummary: diffSummary(current as unknown as Record<string, unknown>, updated as unknown as Record<string, unknown>) || actionLabel,
      sensitive: true,
    }).catch((error) => console.error("course change update audit failed", error));
    return NextResponse.json(courseChangeDisplay(updated));
  } catch (error) {
    return NextResponse.json({ error: databaseErrorMessage(error, "更新異動申請失敗") }, { status: 400 });
  }
}
