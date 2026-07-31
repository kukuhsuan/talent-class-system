import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { SALARY_ROLES, SENSITIVE_FINANCE_ROLES, requireRole, sameOriginOk } from "@/lib/permissions";
import { maskBankAccount } from "@/lib/bankMask";
import { ensureTeacherExtendedColumns } from "@/lib/teacherColumns";
import { DOC_STATUS, bankbookStatusOf, listTeacherDocuments } from "@/lib/teacherDocument";
import { bankChangedAtMap, teacherPayoutReadiness } from "@/lib/teacherPayoutReadiness";
import { writeAuditLog } from "@/lib/auditLog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isPayoutMonth(value: string) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

// 發薪前提醒：/salary 用這支拿每位老師的匯款準備狀態。
// 判斷邏輯集中在 teacherPayoutReadiness()，這裡只負責把資料湊齊。
export async function GET() {
  const { response } = await requireRole(SALARY_ROLES);
  if (response) return response;
  await ensureTeacherExtendedColumns();

  const teachers = await prisma.teacher.findMany({
    select: {
      id: true, name: true,
      bankName: true, bankCode: true, bankBranch: true, bankAccountName: true, bankAccountNumber: true,
      bankRemitNotes: true, firstPaidMonth: true, lastPaidMonth: true, lastPaidAt: true,
    },
    orderBy: { id: "asc" },
  });

  const ids = teachers.map((teacher) => teacher.id);
  const [documents, changedMap] = await Promise.all([
    listTeacherDocuments(ids).catch(() => []),
    bankChangedAtMap(ids).catch(() => new Map<number, Date>()),
  ]);

  const rows = teachers.map((teacher) => {
    const bankbookStatus = bankbookStatusOf(documents, teacher.id);
    const readiness = teacherPayoutReadiness({
      bankName: teacher.bankName ?? "",
      bankAccountNumber: teacher.bankAccountNumber ?? "",
      bankAccountName: teacher.bankAccountName ?? "",
      firstPaidMonth: teacher.firstPaidMonth ?? "",
      lastPaidMonth: teacher.lastPaidMonth ?? "",
      bankbookStatus,
      bankChangedAt: changedMap.get(teacher.id) ?? null,
      lastPaidAt: teacher.lastPaidAt ?? null,
    });
    return {
      teacherId: teacher.id,
      name: teacher.name,
      // 帳號永遠只回遮罩版；要看明碼請走 /api/teachers/{id}?reveal=1（會寫稽核）
      bankLine: [teacher.bankCode, teacher.bankName, teacher.bankBranch].filter(Boolean).join(" "),
      bankAccountMasked: maskBankAccount(teacher.bankCode, teacher.bankAccountNumber),
      bankAccountName: teacher.bankAccountName ?? "",
      bankRemitNotes: teacher.bankRemitNotes ?? "",
      bankbookStatus,
      firstPaidMonth: teacher.firstPaidMonth ?? "",
      lastPaidMonth: teacher.lastPaidMonth ?? "",
      readiness,
    };
  });

  return NextResponse.json({
    rows,
    summary: {
      block: rows.filter((row) => row.readiness.level === "block").length,
      warn: rows.filter((row) => row.readiness.level === "warn").length,
      ok: rows.filter((row) => row.readiness.level === "ok").length,
    },
  });
}

// 標記已匯款：firstPaidMonth 只有第一次寫入，lastPaidMonth 一律更新為當期月份。
// 這是「匯款事實」，所以不開放一般教師編輯表單寫入，只能從這裡與回填工具進來。
export async function POST(req: NextRequest) {
  const { user, response } = await requireRole(SENSITIVE_FINANCE_ROLES);
  if (response) return response;
  if (!sameOriginOk(req)) return NextResponse.json({ error: "來源不合法" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const payoutMonth = String(body?.payoutMonth ?? "").trim();
  const teacherIds = Array.isArray(body?.teacherIds) ? body.teacherIds.map(Number).filter(Number.isFinite) : [];
  if (!isPayoutMonth(payoutMonth)) return NextResponse.json({ error: "月份格式錯誤（需為 YYYY-MM）" }, { status: 400 });
  if (teacherIds.length === 0) return NextResponse.json({ error: "請選擇要標記的老師" }, { status: 400 });

  await ensureTeacherExtendedColumns();
  const teachers = await prisma.teacher.findMany({
    where: { id: { in: teacherIds } },
    select: {
      id: true, name: true, bankName: true, bankAccountName: true, bankAccountNumber: true,
      firstPaidMonth: true, lastPaidMonth: true,
    },
  });
  if (teachers.length === 0) return NextResponse.json({ error: "找不到老師資料" }, { status: 404 });

  // 存摺沒審過或帳號不齊就不該標記已匯款，否則提醒機制自己就先失效了
  const documents = await listTeacherDocuments(teachers.map((teacher) => teacher.id)).catch(() => []);
  const blocked = teachers.filter((teacher) => {
    const missingBank = !teacher.bankName?.trim() || !teacher.bankAccountNumber?.trim() || !teacher.bankAccountName?.trim();
    return missingBank || bankbookStatusOf(documents, teacher.id) !== DOC_STATUS.done;
  });
  if (blocked.length > 0) {
    return NextResponse.json(
      { error: `以下老師的匯款資料或存摺尚未完成，不能標記已匯款：${blocked.map((teacher) => teacher.name).join("、")}` },
      { status: 400 },
    );
  }

  const now = new Date();
  const updated: string[] = [];
  for (const teacher of teachers) {
    const isFirst = !String(teacher.firstPaidMonth ?? "").trim();
    await prisma.teacher.update({
      where: { id: teacher.id },
      data: {
        ...(isFirst ? { firstPaidMonth: payoutMonth } : {}),
        lastPaidMonth: payoutMonth,
        lastPaidAt: now,
      },
    });
    updated.push(`${teacher.name}${isFirst ? "（首次）" : ""}`);
  }

  await writeAuditLog(req, {
    action: "update",
    targetType: "Teacher",
    targetLabel: `${payoutMonth} 標記已匯款`,
    diffSummary: `標記已匯款（${payoutMonth}）${updated.length} 位：${updated.slice(0, 15).join("、")}${updated.length > 15 ? " 等" : ""}`,
    sensitive: true,
  });

  return NextResponse.json({ ok: true, payoutMonth, updatedCount: teachers.length, updatedBy: user?.name || user?.username || "" });
}
