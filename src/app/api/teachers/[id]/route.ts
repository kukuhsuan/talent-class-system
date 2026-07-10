import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { diffSummary, writeAuditLog } from "@/lib/auditLog";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const teacher = await prisma.teacher.findUnique({ where: { id: Number(id) } });
  if (!teacher) return NextResponse.json({ error: "找不到老師資料" }, { status: 404 });
  return NextResponse.json(teacher);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await req.json();
  const before = await prisma.teacher.findUnique({ where: { id: Number(id) } });
  if (!before) return NextResponse.json({ error: "找不到老師資料" }, { status: 404 });
  const teacher = await prisma.teacher.update({
    where: { id: Number(id) },
    data: {
      ...data,
      lineUserId: data.lineUserId?.trim() || null,
      lineRegion: data.lineRegion || "",
      isAssistant: Boolean(data.isAssistant),
      assistantFee: Number(data.assistantFee) || 0,
      bankName: data.bankName?.trim() || "",
      bankCode: data.bankCode?.trim() || "",
      bankBranch: data.bankBranch?.trim() || "",
      bankAccountName: data.bankAccountName?.trim() || data.name?.trim() || "",
      bankAccountNumber: data.bankAccountNumber?.replace(/\s+/g, "") || "",
    },
  });
  await writeAuditLog(req, {
    action: "update",
    targetType: "Teacher",
    targetId: teacher.id,
    targetLabel: `老師：${teacher.name}`,
    beforeData: before,
    afterData: teacher,
    diffSummary: diffSummary(before as unknown as Record<string, unknown>, teacher as unknown as Record<string, unknown>, {
      name: "姓名",
      lineUserId: "LINE 綁定",
      rateAfterSchool: "課後薪資",
      rateInSchool: "課內薪資",
      travelFee: "車馬費",
      bankAccountNumber: "銀行帳號",
    }) || `修改老師：${teacher.name}`,
    sensitive: true,
  });
  return NextResponse.json(teacher);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const teacherId = Number(id);
  const before = await prisma.teacher.findUnique({ where: { id: teacherId } });
  if (!before) return NextResponse.json({ error: "找不到老師資料" }, { status: 404 });
  const [courses, attendances, leaveRequests, substitutes, inquiries, salaryAdjustments] = await Promise.all([
    prisma.course.count({ where: { OR: [{ teacherId }, { assistantTeacherId: teacherId }] } }),
    prisma.attendance.count({ where: { OR: [{ actualTeacherId: teacherId }, { assistantTeacherId: teacherId }] } }),
    prisma.teacherLeaveRequest.count({ where: { teacherId } }),
    prisma.substitute.count({ where: { OR: [{ originalTeacherId: teacherId }, { substituteTeacherId: teacherId }] } }),
    prisma.substituteInquiry.count({ where: { candidateTeacherId: teacherId } }),
    prisma.salaryAdjustment.count({ where: { teacherId } }),
  ]);
  const blockers = [
    courses ? `課程 ${courses} 筆` : "",
    attendances ? `出勤 ${attendances} 筆` : "",
    leaveRequests ? `請假 ${leaveRequests} 筆` : "",
    substitutes ? `代課 ${substitutes} 筆` : "",
    inquiries ? `代課詢問 ${inquiries} 筆` : "",
    salaryAdjustments ? `薪資調整 ${salaryAdjustments} 筆` : "",
  ].filter(Boolean);
  if (blockers.length > 0) {
    return NextResponse.json({
      error: `「${before.name}」已有${blockers.join("、")}，不能直接刪除，以免影響歷史出勤與薪資資料。若老師離職，請保留資料並移除 LINE 綁定或在備註標記停用。`,
      blockers,
    }, { status: 409 });
  }
  await prisma.teacher.delete({ where: { id: teacherId } });
  await writeAuditLog(req, {
    action: "delete",
    targetType: "Teacher",
    targetId: id,
    targetLabel: `老師：${before.name}`,
    beforeData: before,
    diffSummary: `刪除老師：${before.name}`,
    sensitive: true,
  });
  return NextResponse.json({ ok: true });
}
