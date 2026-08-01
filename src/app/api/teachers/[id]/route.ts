import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { diffSummary, writeAuditLog } from "@/lib/auditLog";
import { ADMIN_ROLES, BACKOFFICE_ROLES, SALARY_ROLES, SENSITIVE_FINANCE_ROLES, hasRole, requireRole, sameOriginOk } from "@/lib/permissions";
import { maskBankAccount } from "@/lib/bankMask";
import { ensureTeacherExtendedColumns, parseTeachingSubjects, serializeTeachingSubjects } from "@/lib/teacherColumns";

const TEACHER_WRITE_ROLES = [...ADMIN_ROLES, "staff"] as const;

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // 這支以前完全沒有權限檢查，等於任何人都能撈到銀行帳號明碼。
  const { user, response } = await requireRole(BACKOFFICE_ROLES);
  if (response) return response;
  const role = user?.role ?? "";
  const { id } = await params;
  await ensureTeacherExtendedColumns();
  const teacher = await prisma.teacher.findUnique({ where: { id: Number(id) } });
  if (!teacher) return NextResponse.json({ error: "找不到老師資料" }, { status: 404 });

  const canSeeBank = hasRole(role, SALARY_ROLES);
  const canReveal = hasRole(role, SENSITIVE_FINANCE_ROLES);
  // ?reveal=1 才回明碼，且限 SENSITIVE_FINANCE_ROLES，每次都寫稽核（誰在何時看了誰的帳號）
  const reveal = req.nextUrl.searchParams.get("reveal") === "1" && canReveal;
  if (reveal) {
    await writeAuditLog(req, {
      action: "export",
      targetType: "Teacher",
      targetId: teacher.id,
      targetLabel: `老師：${teacher.name}`,
      diffSummary: `檢視銀行帳號明碼：${teacher.name}`,
      sensitive: true,
    });
  }

  return NextResponse.json({
    ...teacher,
    bankName: canSeeBank ? teacher.bankName : "",
    bankCode: canSeeBank ? teacher.bankCode : "",
    bankBranch: canSeeBank ? teacher.bankBranch : "",
    bankAccountName: canSeeBank ? teacher.bankAccountName : "",
    bankAccountNumber: reveal ? teacher.bankAccountNumber : "",
    bankAccountMasked: canSeeBank ? maskBankAccount(teacher.bankCode, teacher.bankAccountNumber) : "",
    bankRemitNotes: canSeeBank ? teacher.bankRemitNotes : "",
    teachingSubjects: parseTeachingSubjects(teacher.teachingSubjects),
    canRevealBankAccount: canReveal,
  });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { response } = await requireRole(TEACHER_WRITE_ROLES);
  if (response) return response;
  if (!sameOriginOk(req)) return NextResponse.json({ error: "來源不合法" }, { status: 403 });
  const { id } = await params;
  const data = await req.json();
  await ensureTeacherExtendedColumns();
  const before = await prisma.teacher.findUnique({ where: { id: Number(id) } });
  if (!before) return NextResponse.json({ error: "找不到老師資料" }, { status: 404 });
  // 明列欄位而非 spread：firstPaidMonth / lastPaidMonth / lastPaidAt 是匯款事實，
  // 只能由「標記已匯款」與基準線回填工具寫入，不可從教師表單改掉。
  const teacher = await prisma.teacher.update({
    where: { id: Number(id) },
    data: {
      name: String(data.name ?? before.name).trim() || before.name,
      email: String(data.email ?? "").trim(),
      phone: String(data.phone ?? "").trim(),
      notes: String(data.notes ?? "").trim(),
      rateAfterSchool: Number(data.rateAfterSchool) || 0,
      rateInSchool: Number(data.rateInSchool) || 0,
      rateDemo: Number(data.rateDemo) || 0,
      travelFee: Number(data.travelFee) || 0,
      lineUserId: data.lineUserId?.trim() || null,
      lineRegion: data.lineRegion || "",
      isAssistant: Boolean(data.isAssistant),
      assistantFee: Number(data.assistantFee) || 0,
      // 非財務角色拿不到帳號明碼，編輯姓名或課程資料時送回的銀行欄位會是空字串。
      // 空字串不得清掉已確認資料；如需換帳戶，財務可填入新值覆蓋。
      bankName: data.bankName?.trim() || before.bankName,
      bankCode: data.bankCode?.trim() || before.bankCode,
      bankBranch: data.bankBranch?.trim() || before.bankBranch,
      bankAccountName: data.bankAccountName?.trim() || before.bankAccountName || data.name?.trim() || before.name,
      bankAccountNumber: data.bankAccountNumber?.replace(/[\s-]/g, "") || before.bankAccountNumber,
      bankRemitNotes: String(data.bankRemitNotes ?? "").trim(),
      isCollegeStudent: Boolean(data.isCollegeStudent),
      emergencyContact: String(data.emergencyContact ?? "").trim(),
      salaryNotes: String(data.salaryNotes ?? "").trim(),
      teachingSubjects: serializeTeachingSubjects(data.teachingSubjects),
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
      bankName: "銀行名稱",
      bankCode: "銀行代碼",
      bankBranch: "分行",
      bankAccountName: "匯款戶名",
      bankAccountNumber: "銀行帳號",
      isCollegeStudent: "是否大學生",
      teachingSubjects: "授課項目",
    }) || `修改老師：${teacher.name}`,
    sensitive: true,
  });
  return NextResponse.json(teacher);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { response } = await requireRole(TEACHER_WRITE_ROLES);
  if (response) return response;
  if (!sameOriginOk(req)) return NextResponse.json({ error: "來源不合法" }, { status: 403 });
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
