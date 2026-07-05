import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/auditLog";
import { SALARY_ROLES, requireRole } from "@/lib/permissions";

const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/;

export async function GET(req: NextRequest) {
  const auth = await requireRole(SALARY_ROLES);
  if (auth.response) return auth.response;
  const { searchParams } = new URL(req.url);
  const payoutMonth = searchParams.get("payoutMonth") ?? undefined;
  const teacherId = Number(searchParams.get("teacherId")) || undefined;
  const records = await prisma.salaryAdjustment.findMany({
    where: { ...(payoutMonth ? { payoutMonth } : {}), ...(teacherId ? { teacherId } : {}) },
    include: { teacher: { select: { id: true, name: true } } },
    orderBy: [{ payoutMonth: "desc" }, { createdAt: "desc" }],
  });
  return NextResponse.json(records);
}

export async function POST(req: NextRequest) {
  const auth = await requireRole(SALARY_ROLES);
  if (auth.response) return auth.response;
  const data = await req.json();
  const teacherId = Number(data.teacherId);
  const amount = Number(data.amount);
  if (!teacherId || !Number.isInteger(amount) || amount === 0) return NextResponse.json({ error: "老師與非零整數金額為必填" }, { status: 400 });
  if (!monthPattern.test(data.targetMonth) || !monthPattern.test(data.payoutMonth)) return NextResponse.json({ error: "月份格式必須為 YYYY-MM" }, { status: 400 });
  if (!String(data.reason ?? "").trim()) return NextResponse.json({ error: "請填寫補發／扣款原因" }, { status: 400 });
  const record = await prisma.salaryAdjustment.create({ data: {
    teacherId, targetMonth: data.targetMonth, payoutMonth: data.payoutMonth,
    type: String(data.type ?? (amount > 0 ? "補發" : "扣款")), amount,
    reason: String(data.reason).trim(), notes: String(data.notes ?? "").trim(),
    createdBy: String(data.createdBy ?? "系統管理員").trim(),
  } });
  await writeAuditLog(req, {
    action: "create",
    targetType: "SalaryAdjustment",
    targetId: record.id,
    targetLabel: `${record.payoutMonth} ${record.reason}`,
    afterData: record,
    diffSummary: `新增薪資調整：${record.payoutMonth} ${record.type} ${record.amount} 元`,
    sensitive: true,
  });
  return NextResponse.json(record, { status: 201 });
}
