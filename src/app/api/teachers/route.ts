import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/auditLog";
import { teacherTeachingProfiles } from "@/lib/teacherTeachingProfile";
import { ADMIN_ROLES, BACKOFFICE_ROLES, NOTIFY_ROLES, SALARY_ROLES, hasRole, requireRole, sameOriginOk } from "@/lib/permissions";
import { maskBankAccount } from "@/lib/bankMask";
import { ensureTeacherExtendedColumns, parseTeachingSubjects, serializeTeachingSubjects } from "@/lib/teacherColumns";

const TEACHER_CREATE_ROLES = [...ADMIN_ROLES, "staff"] as const;

// 遮罩 LINE User ID：只顯示前 6 碼供辨識（route 檔不可 export 非 HTTP handler）
function maskLineUserId(id: string | null | undefined) {
  const value = String(id ?? "");
  return value ? `${value.slice(0, 6)}…` : "";
}

export async function GET(req: NextRequest) {
  const { user, response } = await requireRole(BACKOFFICE_ROLES);
  if (response) return response;
  const role = user?.role ?? "";
  // 個資分級：銀行/薪資欄位限 SALARY_ROLES；完整 lineUserId 與綁定碼限可發通知角色
  const canSeeBank = hasRole(role, SALARY_ROLES);
  const canSeeLine = hasRole(role, NOTIFY_ROLES);
  // 會計不在 ADMIN_ROLES 也不在 NOTIFY_ROLES，但發薪時需要聯絡老師確認匯款資料
  const canSeeContact = hasRole(role, ADMIN_ROLES) || hasRole(role, NOTIFY_ROLES) || role === "accountant";

  // 效能：minimal 模式只回下拉選單需要的欄位，跳過近 90 天出勤全量掃描（teacherTeachingProfiles）
  if (req.nextUrl.searchParams.get("minimal") === "1") {
    const rows = await prisma.teacher.findMany({
      select: { id: true, name: true, isAssistant: true },
      orderBy: { name: "asc" },
    });
    return NextResponse.json(rows, { headers: { "Cache-Control": "private, max-age=300" } });
  }

  await ensureTeacherExtendedColumns();
  const teachers = await prisma.teacher.findMany({ orderBy: { name: "asc" } });
  const profiles = await teacherTeachingProfiles(prisma, teachers.map((teacher) => teacher.id));
  return NextResponse.json(teachers.map((row) => {
    const teachingProfile = profiles.get(row.id);
    return {
      ...row,
      // 依角色過濾敏感欄位
      bankName: canSeeBank ? row.bankName : "",
      bankCode: canSeeBank ? row.bankCode : "",
      bankBranch: canSeeBank ? row.bankBranch : "",
      bankAccountName: canSeeBank ? row.bankAccountName : "",
      // 列表一律不回明碼；需要明碼請走 /api/teachers/{id}?reveal=1（限 SENSITIVE_FINANCE_ROLES 並寫稽核）
      bankAccountNumber: undefined,
      bankAccountMasked: canSeeBank ? maskBankAccount(row.bankCode, row.bankAccountNumber) : "",
      teachingSubjects: parseTeachingSubjects(row.teachingSubjects),
      lineUserId: canSeeLine ? row.lineUserId : (row.lineUserId ? maskLineUserId(row.lineUserId) : null),
      lineBound: Boolean(row.lineUserId),
      lineBindCode: canSeeLine ? row.lineBindCode : "",
      phone: canSeeContact ? row.phone : "",
      email: canSeeContact ? row.email : "",
      teachingProfile,
    };
  }));
}

export async function POST(req: NextRequest) {
  const { response } = await requireRole(TEACHER_CREATE_ROLES);
  if (response) return response;
  if (!sameOriginOk(req)) return NextResponse.json({ error: "來源不合法" }, { status: 403 });
  const data = await req.json();
  if (!String(data?.name ?? "").trim() || String(data?.name ?? "").length > 50) {
    return NextResponse.json({ error: "老師姓名必填且不可超過 50 字" }, { status: 400 });
  }
  await ensureTeacherExtendedColumns();
  // 明列欄位而非 spread：避免前端塞進 firstPaidMonth / lastPaidMonth 等匯款事實欄位。
  // 那兩欄只能由「標記已匯款」與基準線回填工具寫入，不可從教師表單改。
  const teacher = await prisma.teacher.create({
    data: {
      name: String(data.name).trim(),
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
      bankName: data.bankName?.trim() || "",
      bankCode: data.bankCode?.trim() || "",
      bankBranch: data.bankBranch?.trim() || "",
      bankAccountName: data.bankAccountName?.trim() || data.name?.trim() || "",
      bankAccountNumber: data.bankAccountNumber?.replace(/[\s-]/g, "") || "",
      bankRemitNotes: String(data.bankRemitNotes ?? "").trim(),
      isCollegeStudent: Boolean(data.isCollegeStudent),
      emergencyContact: String(data.emergencyContact ?? "").trim(),
      salaryNotes: String(data.salaryNotes ?? "").trim(),
      teachingSubjects: serializeTeachingSubjects(data.teachingSubjects),
    },
  });
  await writeAuditLog(req, {
    action: "create",
    targetType: "Teacher",
    targetId: teacher.id,
    targetLabel: `老師：${teacher.name}`,
    afterData: teacher,
    diffSummary: `新增老師：${teacher.name}`,
    sensitive: true,
  });
  return NextResponse.json(teacher, { status: 201 });
}
