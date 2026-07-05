import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLineConfig, pushMessage } from "@/lib/line";
import type { LineRegion } from "@/lib/line";
import { writeAuditLog } from "@/lib/auditLog";
import { assignSubstitute } from "@/lib/substituteAssignment";
import { getTeacherLeave, INQUIRY_STATUS, LEAVE_STATUS } from "@/lib/teacherLeaves";

function slashDate(date: string) {
  return date.replaceAll("-", "/");
}

function courseSummary(leave: NonNullable<Awaited<ReturnType<typeof getTeacherLeave>>>) {
  return `日期：${slashDate(leave.leaveDate)}\n時間：${leave.time}\n園所：${leave.school}\n課程：${leave.courseType}`;
}

function noLongerNeededText(leave: NonNullable<Awaited<ReturnType<typeof getTeacherLeave>>>) {
  return `✅ 代課已安排完成\n\n老師您好，以下課程目前已找到代課老師，這次就先不用麻煩您協助代課了，謝謝您的回覆與協助。\n\n${courseSummary(leave)}\n\n謝謝老師！`;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const leave = await getTeacherLeave(Number(id));
    if (!leave) return NextResponse.json({ error: "找不到請假申請" }, { status: 404 });
    if (leave.isPayrollLocked) return NextResponse.json({ error: "此課程已鎖定薪資，不可確認代課" }, { status: 409 });

    const data = await req.json().catch(() => ({}));
    const substituteTeacherId = Number(data.substituteTeacherId);
    if (!Number.isFinite(substituteTeacherId)) return NextResponse.json({ error: "請選擇代課老師" }, { status: 400 });
    if (substituteTeacherId === leave.teacherId) return NextResponse.json({ error: "代課老師不能與請假老師相同" }, { status: 400 });
    if (leave.isReported && data.confirmReportedChange !== true) {
      return NextResponse.json({ error: "此課程已回報，若仍要更換老師請再次確認", needsConfirmReportedChange: true }, { status: 409 });
    }

    const substituteTeacher = await prisma.teacher.findUnique({ where: { id: substituteTeacherId } });
    if (!substituteTeacher) return NextResponse.json({ error: "找不到代課老師" }, { status: 404 });

    const notes = String(data.notes ?? "").trim();
    await assignSubstitute({
      attendanceIds: [leave.attendanceId],
      substituteTeacherId,
      role: leave.role,
      confirmed: true,
      notes: [`由請假申請 #${leave.id} 手動指定代課`, notes].filter(Boolean).join("｜"),
    });

    await prisma.$transaction([
      prisma.$executeRawUnsafe(
        `UPDATE "TeacherLeaveRequest"
         SET "status" = ?, "reviewedBy" = ?, "reviewedAt" = COALESCE("reviewedAt", CURRENT_TIMESTAMP), "updatedAt" = CURRENT_TIMESTAMP
         WHERE "id" = ?`,
        LEAVE_STATUS.found,
        "管理端手動指定",
        leave.id,
      ),
      prisma.$executeRawUnsafe(
        `UPDATE "SubstituteInquiry"
         SET "status" = ?, "updatedAt" = CURRENT_TIMESTAMP
         WHERE "leaveRequestId" = ? AND "candidateTeacherId" <> ?`,
        INQUIRY_STATUS.noLongerNeeded,
        leave.id,
        substituteTeacherId,
      ),
    ]);

    const notifyOtherCandidates = data.notifyOtherCandidates !== false;
    const notifySubstituteTeacher = data.notifySubstituteTeacher !== false;
    const skippedNoLine: string[] = [];
    const notifyErrors: string[] = [];
    let otherCandidatesNotified = 0;

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

    if (notifyOtherCandidates) {
      const candidateIds = [...new Set(leave.inquiries.map((inquiry) => inquiry.candidateTeacherId).filter((teacherId) => teacherId !== substituteTeacherId))];
      const candidates = candidateIds.length
        ? await prisma.teacher.findMany({ where: { id: { in: candidateIds } } })
        : [];
      for (const teacher of candidates) {
        if (await pushSafe(teacher, noLongerNeededText(leave))) otherCandidatesNotified++;
      }
    }

    if (notifySubstituteTeacher) {
      await pushSafe(
        substituteTeacher,
        `✅ 已安排您協助代課\n\n行政已安排您協助以下課程代課：\n\n${courseSummary(leave)}\n\n若臨時無法代課，請盡快聯繫行政。`,
      );
    }

    await writeAuditLog(req, {
      action: "update",
      targetType: "TeacherLeaveRequest",
      targetId: leave.id,
      targetLabel: `${leave.leaveDate} ${leave.school} ${leave.courseType}`,
      beforeData: leave,
      afterData: {
        status: LEAVE_STATUS.found,
        substituteTeacher: { id: substituteTeacher.id, name: substituteTeacher.name },
        otherCandidatesNotified,
        skippedNoLine,
        notifyErrors,
      },
      diffSummary: `手動指定代課老師：${substituteTeacher.name}；其他候選通知 ${otherCandidatesNotified} 位`,
      sensitive: true,
    });

    return NextResponse.json({
      ok: true,
      substituteTeacher: { id: substituteTeacher.id, name: substituteTeacher.name },
      otherCandidatesNotified,
      skippedNoLine,
      notifyErrors,
    });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message || "手動指定代課失敗" }, { status: 400 });
  }
}
