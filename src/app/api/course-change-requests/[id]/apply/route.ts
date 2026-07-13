import { NextRequest, NextResponse } from "next/server";
import { ADMIN_ROLES, requireRole } from "@/lib/permissions";
import { applyCourseChangeRequest, courseChangeDisplay, getCourseChangeRequest } from "@/lib/courseChangeRequests";
import { getLineConfig, pushMessage } from "@/lib/line";
import type { LineRegion } from "@/lib/line";
import { writeAuditLog } from "@/lib/auditLog";
import { databaseErrorMessage, withDatabaseRetry } from "@/lib/databaseRetry";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(ADMIN_ROLES);
  if (auth.response || !auth.user) return auth.response;
  const { id } = await params;
  const requestId = Number(id);
  try {
    const before = await withDatabaseRetry(() => getCourseChangeRequest(requestId));
    if (!before) return NextResponse.json({ error: "找不到課程異動申請" }, { status: 404 });
    const updated = await withDatabaseRetry(() => applyCourseChangeRequest(requestId, { userId: auth.user.userId, name: auth.user.name }));
    let notifyError = "";
    if (updated.teacher.lineUserId && updated.teacher.lineRegion) {
      try {
        await pushMessage(updated.teacher.lineUserId, [{
          type: "text",
          text: `課程異動已由行政確認並更新正式課表。\n\n園所：${updated.newSchoolName || updated.originalSchoolName}\n課程：${updated.course.courseType}\n日期：${(updated.newDate || updated.originalDate).toISOString().slice(0, 10)}\n時間：${updated.newStartTime && updated.newEndTime ? `${updated.newStartTime}-${updated.newEndTime}` : `${updated.originalStartTime}-${updated.originalEndTime}`}\n\n謝謝老師配合。`,
        }], getLineConfig(updated.teacher.lineRegion as LineRegion).token);
      } catch (error) {
        notifyError = (error as Error).message || "完成通知發送失敗";
      }
    }
    await writeAuditLog(req, {
      action: "approve",
      targetType: "CourseChangeRequest",
      targetId: updated.id,
      targetLabel: `${updated.originalSchoolName} ${updated.course.courseType}`,
      beforeData: before,
      afterData: updated,
      diffSummary: `確認並套用課程異動，共 ${updated.targets.length} 堂${notifyError ? `；老師通知失敗：${notifyError}` : ""}`,
      sensitive: true,
    }).catch((error) => {
      console.error("course change audit log failed after apply", error);
    });
    return NextResponse.json({ ...courseChangeDisplay(updated), notifyError });
  } catch (error) {
    return NextResponse.json({ error: databaseErrorMessage(error, "套用課程異動失敗") }, { status: 409 });
  }
}
