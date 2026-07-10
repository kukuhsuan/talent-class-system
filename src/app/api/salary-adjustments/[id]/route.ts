import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { diffSummary, writeAuditLog } from "@/lib/auditLog";
import { SALARY_ROLES, requireRole } from "@/lib/permissions";
import { getPayrollRun } from "@/lib/payrollRun";

// M14：發放月已結算鎖定 → 調整不可增刪改（快照不會反映，會造成帳實不符）
async function payoutMonthLocked(payoutMonth: string) {
  const [year, month] = payoutMonth.split("-").map(Number);
  return Boolean(await getPayrollRun(year, month).catch(() => null));
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(SALARY_ROLES);
  if (auth.response) return auth.response;
  const { id } = await params;
  const data = await req.json();
  const current = await prisma.salaryAdjustment.findUnique({ where: { id: Number(id) } });
  if (!current) return NextResponse.json({ error: "補發紀錄不存在" }, { status: 404 });
  if (await payoutMonthLocked(current.payoutMonth)) return NextResponse.json({ error: `${current.payoutMonth} 已結算鎖定，不可修改調整` }, { status: 409 });
  const isPaid = data.isPaid === undefined ? current.isPaid : Boolean(data.isPaid);
  const record = await prisma.salaryAdjustment.update({ where: { id: current.id }, data: {
    ...(data.type !== undefined ? { type: String(data.type) } : {}),
    ...(data.amount !== undefined ? { amount: Number(data.amount) } : {}),
    ...(data.reason !== undefined ? { reason: String(data.reason).trim() } : {}),
    ...(data.notes !== undefined ? { notes: String(data.notes).trim() } : {}),
    isPaid, paidAt: isPaid ? current.paidAt ?? new Date() : null,
  } });
  await writeAuditLog(req, {
    action: "update",
    targetType: "SalaryAdjustment",
    targetId: record.id,
    targetLabel: `${record.payoutMonth} ${record.reason}`,
    beforeData: current,
    afterData: record,
    diffSummary: diffSummary(current as unknown as Record<string, unknown>, record as unknown as Record<string, unknown>, {
      amount: "金額",
      reason: "原因",
      notes: "備註",
      isPaid: "付款狀態",
    }) || `修改薪資調整：${record.id}`,
    sensitive: true,
  });
  return NextResponse.json(record);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(SALARY_ROLES);
  if (auth.response) return auth.response;
  const { id } = await params;
  const current = await prisma.salaryAdjustment.findUnique({ where: { id: Number(id) } });
  if (!current) return NextResponse.json({ error: "補發紀錄不存在" }, { status: 404 });
  if (current.isPaid) return NextResponse.json({ error: "已付款紀錄不可刪除，請先取消付款標記" }, { status: 409 });
  if (await payoutMonthLocked(current.payoutMonth)) return NextResponse.json({ error: `${current.payoutMonth} 已結算鎖定，不可刪除調整` }, { status: 409 });
  await prisma.salaryAdjustment.delete({ where: { id: current.id } });
  await writeAuditLog(req, {
    action: "delete",
    targetType: "SalaryAdjustment",
    targetId: current.id,
    targetLabel: `${current.payoutMonth} ${current.reason}`,
    beforeData: current,
    diffSummary: `刪除薪資調整：${current.payoutMonth} ${current.reason}`,
    sensitive: true,
  });
  return NextResponse.json({ ok: true });
}
