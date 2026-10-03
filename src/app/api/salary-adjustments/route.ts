import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/auditLog";
import { SALARY_ROLES, requireRole } from "@/lib/permissions";
import { getPayrollRun } from "@/lib/payrollRun";
import { ensureCourseTravelFeeColumn } from "@/lib/courseTravelFee";

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
  // 課程固定車資已由出勤自動計算，不允許再以「車資／交通」名義人工補一筆，避免月底重複發放。
  const adjustmentText = `${data.type ?? ""} ${data.reason ?? ""} ${data.notes ?? ""}`;
  if (amount > 0 && /(車資|交通|車馬)/.test(adjustmentText)) {
    await ensureCourseTravelFeeColumn();
    const [targetYear, targetMonth] = String(data.targetMonth).split("-").map(Number);
    const start = new Date(Date.UTC(targetYear, targetMonth - 1, 1));
    const end = new Date(Date.UTC(targetYear, targetMonth, 1));
    const automaticTravel = await prisma.attendance.findFirst({
      where: {
        actualTeacherId: teacherId,
        date: { gte: start, lt: end },
        cancelled: false,
        course: { travelFee: { gt: 0 } },
        OR: [
          { reportSentAt: { not: null } },
          { reportContent: { not: "" } },
          { studentCount: { not: null } },
          { studentCountA: { not: null } },
          { studentCountB: { not: null } },
        ],
      },
      select: { id: true },
    });
    if (automaticTravel) {
      return NextResponse.json({ error: "這位老師本月已有課程固定車資自動計入，不能再新增車資補貼，以免重複。其他特殊補貼請使用不同原因並註明用途。" }, { status: 409 });
    }
  }
  // M14：發放月已結算鎖定 → 不可再新增調整（快照不會反映，會造成帳實不符）
  const [lockYear, lockMonth] = String(data.payoutMonth).split("-").map(Number);
  const run = await getPayrollRun(lockYear, lockMonth).catch(() => null);
  if (run) return NextResponse.json({ error: `${data.payoutMonth} 已結算鎖定，請改掛到下一個發放月份，或先解鎖（限最高權限）` }, { status: 409 });
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
