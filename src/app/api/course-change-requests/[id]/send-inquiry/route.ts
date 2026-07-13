import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ADMIN_ROLES, requireRole } from "@/lib/permissions";
import { addCourseChangeEvent, COURSE_CHANGE_STATUS, courseChangeDisplay, courseChangeInclude, getCourseChangeRequest, parseChangeTypes, timeRange } from "@/lib/courseChangeRequests";
import { buildCourseChangeInquiryMessage, getLineConfig, pushMessage } from "@/lib/line";
import type { LineRegion } from "@/lib/line";
import { writeAuditLog } from "@/lib/auditLog";
import { databaseErrorMessage, withDatabaseRetry } from "@/lib/databaseRetry";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(ADMIN_ROLES);
  if (auth.response || !auth.user) return auth.response;
  const { id } = await params;
  const requestId = Number(id);
  try {
    const current = await withDatabaseRetry(() => getCourseChangeRequest(requestId));
    if (!current) return NextResponse.json({ error: "找不到課程異動申請" }, { status: 404 });
    if (![COURSE_CHANGE_STATUS.pendingReview, COURSE_CHANGE_STATUS.teacherUnavailable, COURSE_CHANGE_STATUS.discuss].includes(current.status as never)) {
      throw new Error("目前狀態不能發送老師詢問");
    }
    if (!current.teacher.lineUserId || !current.teacher.lineRegion) throw new Error(`${current.teacher.name} 尚未綁定 LINE`);
    const types = parseChangeTypes(current.changeTypes);
    const originalPlace = [current.originalSchoolName, current.originalLocation].filter(Boolean).join("・");
    const newPlace = [current.newSchoolName || current.originalSchoolName, current.newLocation].filter(Boolean).join("・");
    const message = buildCourseChangeInquiryMessage({
      requestId: current.id,
      school: current.originalSchoolName,
      courseType: current.course.courseType,
      changeTypes: types,
      originalDate: current.originalDate.toISOString().slice(0, 10),
      newDate: current.newDate?.toISOString().slice(0, 10),
      originalTime: timeRange(current.originalStartTime, current.originalEndTime),
      newTime: timeRange(current.newStartTime, current.newEndTime),
      originalPlace,
      newPlace,
      newAddress: current.newAddress,
      newStudentCount: current.newStudentCount,
      reason: [current.reasonType, current.reasonNote].filter(Boolean).join("："),
    });

    // 先鎖定狀態再送 LINE，避免 LINE 已送出但 DB 502 時重複發送。
    const updated = await withDatabaseRetry(() => prisma.$transaction(async (tx) => {
      const row = await tx.courseChangeRequest.update({
        where: { id: current.id },
        data: {
          status: COURSE_CHANGE_STATUS.pendingTeacher,
          lineSentAt: new Date(),
          teacherResponse: "",
          teacherRespondedAt: null,
          reviewedByUserId: auth.user!.userId,
          reviewedByName: auth.user!.name,
          reviewedAt: new Date(),
        },
      });
      await addCourseChangeEvent(tx, {
        requestId: current.id,
        actorType: "admin",
        actorId: auth.user!.userId,
        actorName: auth.user!.name,
        action: "發送老師確認",
        fromStatus: current.status,
        toStatus: COURSE_CHANGE_STATUS.pendingTeacher,
        note: `發送給 ${current.teacher.name}`,
      });
      return tx.courseChangeRequest.findUniqueOrThrow({ where: { id: row.id }, include: courseChangeInclude });
    }));
    try {
      await pushMessage(current.teacher.lineUserId, [message], getLineConfig(current.teacher.lineRegion as LineRegion).token);
    } catch (error) {
      await withDatabaseRetry(() => prisma.courseChangeRequest.update({
        where: { id: current.id },
        data: { status: current.status, lineSentAt: null },
      })).catch(() => undefined);
      throw error;
    }
    await writeAuditLog(req, {
      action: "send_line",
      targetType: "CourseChangeRequest",
      targetId: current.id,
      targetLabel: `${current.originalSchoolName} ${current.course.courseType}`,
      beforeData: current,
      afterData: updated,
      diffSummary: `發送課程異動詢問給 ${current.teacher.name}`,
      sensitive: true,
    }).catch((error) => console.error("course change send audit failed", error));
    return NextResponse.json(courseChangeDisplay(updated));
  } catch (error) {
    return NextResponse.json({ error: databaseErrorMessage(error, "發送老師詢問失敗") }, { status: 400 });
  }
}
