import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { OWNER_ROLES, requireRole } from "@/lib/permissions";
import { writeAuditLog } from "@/lib/auditLog";

const SOURCE_ID = 1762;
const TARGET_ID = 1761;

function confirmationPage(message = "") {
  return new NextResponse(`<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><body style="font-family:system-ui;padding:32px;max-width:560px;margin:auto"><h1>修正誤填課程回報</h1><p>將 7/14（#${SOURCE_ID}）的完整回報搬到 7/13（#${TARGET_ID}），完成後清空 7/14。</p>${message ? `<p style="color:#087f5b;font-weight:700">${message}</p>` : `<form method="post"><button style="padding:12px 18px;font-size:16px">確認執行資料搬移</button></form>`}</body></html>`, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export async function GET() {
  const auth = await requireRole(OWNER_ROLES);
  if (auth.response) return auth.response;
  return confirmationPage();
}

export async function POST(req: NextRequest) {
  const auth = await requireRole(OWNER_ROLES);
  if (auth.response) return auth.response;

  const result = await prisma.$transaction(async (tx) => {
    const [source, target] = await Promise.all([
      tx.attendance.findUnique({ where: { id: SOURCE_ID }, include: { course: true } }),
      tx.attendance.findUnique({ where: { id: TARGET_ID }, include: { course: true } }),
    ]);
    if (!source || !target) throw new Error("找不到指定的出勤紀錄");
    if (source.courseId !== target.courseId || source.actualTeacherId !== target.actualTeacherId) {
      throw new Error("兩筆出勤的課程或老師不同，已停止搬移");
    }
    if (!source.reportContent.trim() || source.studentCount == null) {
      throw new Error("來源回報不完整，已停止搬移");
    }
    if (target.reportContent.trim() || target.studentCount != null) {
      throw new Error("目標已有回報資料，已停止搬移以避免覆蓋");
    }

    const reportData = {
      studentCount: source.studentCount,
      studentCountA: source.studentCountA,
      studentCountB: source.studentCountB,
      reportContent: source.reportContent,
      reportSentAt: source.reportSentAt,
      schoolNotifyStatus: source.schoolNotifyStatus,
      schoolNotifyError: source.schoolNotifyError,
      schoolNotifiedAt: source.schoolNotifiedAt,
      skillFocus: source.skillFocus,
      classStatus: source.classStatus,
      incident: source.incident,
      incidentChild: source.incidentChild,
      incidentProcess: source.incidentProcess,
      incidentAction: source.incidentAction,
      incidentNotified: source.incidentNotified,
      reportPhotos: source.reportPhotos,
      aiSummary: source.aiSummary,
      aiSkillFocus: source.aiSkillFocus,
      aiTeachingNote: source.aiTeachingNote,
    };
    await tx.attendance.update({ where: { id: TARGET_ID }, data: reportData });
    await tx.attendance.update({
      where: { id: SOURCE_ID },
      data: {
        studentCount: null, studentCountA: null, studentCountB: null,
        reportContent: "", reportSentAt: null,
        schoolNotifyStatus: "未通知", schoolNotifyError: "", schoolNotifiedAt: null,
        skillFocus: "", classStatus: "", incident: false,
        incidentChild: "", incidentProcess: "", incidentAction: "", incidentNotified: "",
        reportPhotos: "", aiSummary: "", aiSkillFocus: "", aiTeachingNote: "",
      },
    });
    return { source, target, reportData };
  });

  await writeAuditLog(req, {
    action: "update",
    targetType: "Attendance",
    targetId: TARGET_ID,
    targetLabel: `搬移課程回報 #${SOURCE_ID} → #${TARGET_ID}`,
    beforeData: { sourceId: SOURCE_ID, targetId: TARGET_ID },
    afterData: { targetId: TARGET_ID, studentCount: result.reportData.studentCount, reportSentAt: result.reportData.reportSentAt },
    diffSummary: `修正老師提前誤填：將 7/14 #${SOURCE_ID} 回報搬至 7/13 #${TARGET_ID}`,
    sensitive: true,
  });
  return confirmationPage("資料搬移完成：7/13 已完成回報，7/14 已恢復為未上課。此修復入口將立即移除。");
}
