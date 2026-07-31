import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { SENSITIVE_FINANCE_ROLES, requireRole, sameOriginOk } from "@/lib/permissions";
import { ensurePayrollRunTable, type PayrollRunRow } from "@/lib/payrollRun";
import { ensureTeacherExtendedColumns } from "@/lib/teacherColumns";
import { writeAuditLog } from "@/lib/auditLog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CONFIRM = "backfill-payout-baseline";

type Proposal = {
  teacherId: number;
  name: string;
  currentFirstPaidMonth: string;
  currentLastPaidMonth: string;
  firstPaidMonth: string;
  lastPaidMonth: string;
  lastPaidAt: string;
  paidMonthCount: number;
  willChange: boolean;
};

// 從已結算鎖定的 PayrollRun 快照倒推「這位老師實際被算過薪水的月份」。
// 不另外建表也不改 salaryCalculation，快照本來就是當時發薪的憑據。
async function buildProposals(): Promise<{ runs: number; proposals: Proposal[] }> {
  await ensurePayrollRunTable();
  await ensureTeacherExtendedColumns();

  const runs = await prisma.$queryRawUnsafe<PayrollRunRow[]>(
    'SELECT * FROM "PayrollRun" ORDER BY "payoutMonth" ASC',
  );

  // teacherId → 有金額的月份清單（含該月結算時間）
  const paidMonths = new Map<number, Array<{ month: string; finalizedAt: string }>>();
  for (const run of runs) {
    let parsed: { results?: Array<{ teacher?: { id?: number }; total?: number }> } | null = null;
    try {
      parsed = JSON.parse(run.snapshot || "{}");
    } catch {
      continue;
    }
    for (const row of parsed?.results ?? []) {
      const teacherId = Number(row?.teacher?.id);
      const total = Number(row?.total ?? 0);
      if (!Number.isFinite(teacherId) || !(total > 0)) continue;
      const list = paidMonths.get(teacherId) ?? [];
      list.push({ month: run.payoutMonth, finalizedAt: String(run.finalizedAt ?? "") });
      paidMonths.set(teacherId, list);
    }
  }

  const teachers = await prisma.teacher.findMany({
    select: { id: true, name: true, firstPaidMonth: true, lastPaidMonth: true },
    orderBy: { id: "asc" },
  });

  const proposals: Proposal[] = [];
  for (const teacher of teachers) {
    const months = (paidMonths.get(teacher.id) ?? []).sort((a, b) => a.month.localeCompare(b.month));
    if (months.length === 0) continue;
    const first = months[0];
    const last = months[months.length - 1];
    const currentFirst = teacher.firstPaidMonth ?? "";
    const currentLast = teacher.lastPaidMonth ?? "";
    proposals.push({
      teacherId: teacher.id,
      name: teacher.name,
      currentFirstPaidMonth: currentFirst,
      currentLastPaidMonth: currentLast,
      firstPaidMonth: first.month,
      lastPaidMonth: last.month,
      lastPaidAt: last.finalizedAt,
      paidMonthCount: months.length,
      // 已經有紀錄且一致的人不用再寫一次，避免稽核紀錄被無意義的列洗掉
      willChange: currentFirst !== first.month || currentLast !== last.month,
    });
  }

  return { runs: runs.length, proposals };
}

export async function GET() {
  const { response } = await requireRole(SENSITIVE_FINANCE_ROLES);
  if (response) return response;
  const { runs, proposals } = await buildProposals();
  const changing = proposals.filter((row) => row.willChange);
  return NextResponse.json({
    mode: "dry-run",
    payrollRunCount: runs,
    teacherWithPayoutCount: proposals.length,
    willChangeCount: changing.length,
    note: runs === 0
      ? "找不到任何已結算鎖定的 PayrollRun 快照，無法回填基準線；請先確認歷史月份是否已結算。"
      : "此為試算結果，尚未寫入資料庫。確認名單無誤後再執行正式回填。",
    proposals,
  });
}

export async function POST(req: NextRequest) {
  const { user, response } = await requireRole(SENSITIVE_FINANCE_ROLES);
  if (response) return response;
  if (!sameOriginOk(req)) return NextResponse.json({ error: "來源不合法" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  if (body?.confirm !== CONFIRM) {
    return NextResponse.json({ error: `請帶入 confirm: "${CONFIRM}" 才會正式寫入` }, { status: 400 });
  }

  const { runs, proposals } = await buildProposals();
  const picked = Array.isArray(body?.teacherIds) && body.teacherIds.length > 0
    ? new Set(body.teacherIds.map(Number))
    : null;
  const targets = proposals.filter((row) => row.willChange && (!picked || picked.has(row.teacherId)));

  for (const row of targets) {
    const lastPaidAt = row.lastPaidAt ? new Date(row.lastPaidAt.includes("T") ? row.lastPaidAt : `${row.lastPaidAt.replace(" ", "T")}Z`) : null;
    await prisma.teacher.update({
      where: { id: row.teacherId },
      data: {
        firstPaidMonth: row.firstPaidMonth,
        lastPaidMonth: row.lastPaidMonth,
        lastPaidAt: lastPaidAt && !Number.isNaN(lastPaidAt.getTime()) ? lastPaidAt : null,
      },
    });
  }

  await writeAuditLog(req, {
    action: "update",
    targetType: "Teacher",
    targetLabel: "匯款基準線回填",
    diffSummary: `回填匯款基準線 ${targets.length} 位老師（依 ${runs} 份薪資快照）：${targets.slice(0, 10).map((row) => `${row.name} ${row.firstPaidMonth}~${row.lastPaidMonth}`).join("、")}${targets.length > 10 ? " 等" : ""}`,
    afterData: targets,
    sensitive: true,
  });

  return NextResponse.json({
    mode: "executed",
    payrollRunCount: runs,
    updatedCount: targets.length,
    executedBy: user?.name || user?.username || "",
    updated: targets,
  });
}
