import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildSubstituteInquiryMessage, getLineConfig, pushMessage } from "@/lib/line";
import type { LineRegion } from "@/lib/line";
import { getTeacherLeave, LEAVE_STATUS, upsertSubstituteInquiry } from "@/lib/teacherLeaves";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const leave = await getTeacherLeave(Number(id));
    if (!leave) return NextResponse.json({ error: "找不到請假申請" }, { status: 404 });
    if (leave.isPayrollLocked) return NextResponse.json({ error: "此課程已鎖定薪資，不可發送代課詢問" }, { status: 409 });

    const data = await req.json();
    const ids = [...new Set((Array.isArray(data.candidateTeacherIds) ? data.candidateTeacherIds : []).map(Number).filter(Number.isFinite))];
    if (ids.length === 0) return NextResponse.json({ error: "請選擇要詢問的老師" }, { status: 400 });

    const teachers = await prisma.teacher.findMany({ where: { id: { in: ids } } });
    let sent = 0;
    let skipped = 0;
    const skippedTeachers: string[] = [];

    for (const teacher of teachers) {
      if (teacher.id === leave.teacherId) {
        skipped++;
        skippedTeachers.push(`${teacher.name}（原請假老師）`);
        continue;
      }
      if (!teacher.lineUserId || !teacher.lineRegion) {
        skipped++;
        skippedTeachers.push(`${teacher.name}（未綁定 LINE）`);
        continue;
      }
      const inquiryId = await upsertSubstituteInquiry(leave.id, leave.attendanceId, teacher.id);
      const msg = buildSubstituteInquiryMessage({
        inquiryId,
        date: leave.leaveDate,
        time: leave.time,
        school: leave.school,
        courseType: leave.courseType,
        address: leave.address,
      });
      await pushMessage(teacher.lineUserId, [msg], getLineConfig(teacher.lineRegion as LineRegion).token);
      sent++;
    }

    if (sent > 0) {
      await prisma.$executeRawUnsafe(
        `UPDATE "TeacherLeaveRequest" SET "status" = ?, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = ?`,
        LEAVE_STATUS.searching,
        leave.id,
      );
    }

    return NextResponse.json({ ok: true, sent, skipped, skippedTeachers });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message || "代課詢問發送失敗" }, { status: 400 });
  }
}
