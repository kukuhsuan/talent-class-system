import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildSubstituteConfirmedMessage, getLineConfig, pushMessage } from "@/lib/line";
import type { LineRegion } from "@/lib/line";
import { writeAuditLog } from "@/lib/auditLog";
import { assignSubstitute } from "@/lib/substituteAssignment";
import { getTeacherLeave, INQUIRY_STATUS, LEAVE_STATUS } from "@/lib/teacherLeaves";

type Leave = NonNullable<Awaited<ReturnType<typeof getTeacherLeave>>>;

function slashDate(date: string) {
  return date.replaceAll("-", "/");
}

function noLongerNeededText(leave: Leave) {
  return `✅ 代課已安排完成\n\n老師您好，以下課程目前已找到代課老師，這次就先不用麻煩您協助代課了，謝謝您的回覆與協助。\n\n日期：${slashDate(leave.leaveDate)}\n時間：${leave.time}\n園所：${leave.school}\n課程：${leave.courseType}\n\n謝謝老師！`;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const leave = await getTeacherLeave(Number(id));
    if (!leave) return NextResponse.json({ error: "找不到請假申請" }, { status: 404 });
    if (leave.isPayrollLocked) return NextResponse.json({ error: "此課程已鎖定薪資，不可確認代課" }, { status: 409 });

    const data = await req.json();
    const inquiryId = Number(data.inquiryId);
    const inquiry = leave.inquiries.find((item) => item.id === inquiryId);
    if (!inquiry) return NextResponse.json({ error: "找不到這筆老師回覆" }, { status: 404 });
    if (inquiry.status !== INQUIRY_STATUS.available) {
      return NextResponse.json({ error: "此老師尚未回覆可以代課，不能確認" }, { status: 409 });
    }
    if (leave.isReported && data.confirmReportedChange !== true) {
      return NextResponse.json({ error: "此課程已回報，若仍要更換老師請再次確認", needsConfirmReportedChange: true }, { status: 409 });
    }

    await assignSubstitute({
      attendanceIds: [leave.attendanceId],
      substituteTeacherId: inquiry.candidateTeacherId,
      role: leave.role,
      confirmed: true,
      notes: `由請假申請 #${leave.id} 確認代課`,
    });

    await prisma.$transaction([
      prisma.$executeRawUnsafe(
        `UPDATE "TeacherLeaveRequest" SET "status" = ?, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = ?`,
        LEAVE_STATUS.found,
        leave.id,
      ),
      prisma.$executeRawUnsafe(
        `UPDATE "SubstituteInquiry" SET "status" = ?, "updatedAt" = CURRENT_TIMESTAMP WHERE "leaveRequestId" = ? AND "id" <> ?`,
        INQUIRY_STATUS.noLongerNeeded,
        leave.id,
        inquiry.id,
      ),
    ]);

    const subTeacher = await prisma.teacher.findUnique({ where: { id: inquiry.candidateTeacherId } });

    const skippedNoLine: string[] = [];
    const notifyErrors: string[] = [];
    const pushSafe = async (teacher: { name: string; lineUserId: string | null; lineRegion: string | null }, text: string) => {
      if (!teacher.lineUserId || !teacher.lineRegion) {
        skippedNoLine.push(teacher.name);
        return false;
      }
      try {
        await pushMessage(teacher.lineUserId, [{ type: "text", text }], getLineConfig(teacher.lineRegion as LineRegion).token);
        return true;
      } catch (error) {
        notifyErrors.push(`${teacher.name}: ${(error as Error).message || error}`);
        return false;
      }
    };

    if (subTeacher?.lineUserId && subTeacher.lineRegion) {
      try {
        await pushMessage(subTeacher.lineUserId, [buildSubstituteConfirmedMessage({
          inquiryId: inquiry.id,
          date: leave.leaveDate,
          time: leave.time,
          school: leave.school,
          courseType: leave.courseType,
        })], getLineConfig(subTeacher.lineRegion as LineRegion).token);
      } catch (error) {
        notifyErrors.push(`${subTeacher.name}: ${(error as Error).message || error}`);
      }
    } else if (subTeacher) {
      skippedNoLine.push(subTeacher.name);
    }

    const otherCandidateIds = [...new Set(leave.inquiries
      .filter((item) => item.id !== inquiry.id)
      .map((item) => item.candidateTeacherId))];
    let otherCandidatesNotified = 0;
    if (otherCandidateIds.length > 0) {
      const otherCandidates = await prisma.teacher.findMany({ where: { id: { in: otherCandidateIds } } });
      for (const teacher of otherCandidates) {
        if (await pushSafe(teacher, noLongerNeededText(leave))) otherCandidatesNotified++;
      }
    }

    await writeAuditLog(req, {
      action: "approve",
      targetType: "TeacherLeaveRequest",
      targetId: leave.id,
      targetLabel: `${leave.leaveDate} ${leave.school} ${leave.courseType}`,
      beforeData: leave,
      afterData: {
        status: LEAVE_STATUS.found,
        inquiryId: inquiry.id,
        substituteTeacher: subTeacher ? { id: subTeacher.id, name: subTeacher.name } : { id: inquiry.candidateTeacherId },
        otherCandidatesNotified,
        skippedNoLine,
        notifyErrors,
      },
      diffSummary: `確認代課老師：${subTeacher?.name ?? `#${inquiry.candidateTeacherId}`}；其他候選通知 ${otherCandidatesNotified} 位`,
      sensitive: true,
    });

    return NextResponse.json({ ok: true, otherCandidatesNotified, skippedNoLine, notifyErrors });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message || "確認代課失敗" }, { status: 400 });
  }
}
