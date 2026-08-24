import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/auditLog";
import { ensureTeacherExtendedColumns } from "@/lib/teacherColumns";
import { SENSITIVE_FINANCE_ROLES, requireRole, sameOriginOk } from "@/lib/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CONFIRM = "import-verified-payroll-history";

type TeacherPayoutRow = {
  id: number;
  name: string;
  firstPaidMonth: string | null;
  lastPaidMonth: string | null;
  lastPaidAt: Date | null;
};

type PayoutProposal = {
  teacherId: number;
  name: string;
  currentFirstPaidMonth: string;
  currentLastPaidMonth: string;
  firstPaidMonth: string;
  lastPaidMonth: string;
  willChange: boolean;
};

function isPayoutMonth(value: string) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

function monthEnd(value: string) {
  const [year, month] = value.split("-").map(Number);
  // 該月台北時間最後一刻；用於判斷匯款後銀行資料是否曾變更。
  return new Date(Date.UTC(year, month, 0, 15, 59, 59, 999));
}

export async function POST(req: NextRequest) {
  const { user, response } = await requireRole(SENSITIVE_FINANCE_ROLES);
  if (response) return response;
  if (!sameOriginOk(req)) return NextResponse.json({ error: "來源不合法" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const payoutMonth = String(body?.payoutMonth ?? "").trim();
  const sourceLabel = String(body?.sourceLabel ?? "歷史薪資名單").trim().slice(0, 100);
  const requestedNames: string[] = Array.isArray(body?.teacherNames)
    ? body.teacherNames.map((name: unknown) => String(name ?? "").trim()).filter(Boolean)
    : [];

  if (!isPayoutMonth(payoutMonth)) {
    return NextResponse.json({ error: "月份格式錯誤（需為 YYYY-MM）" }, { status: 400 });
  }
  if (requestedNames.length === 0 || requestedNames.length > 500) {
    return NextResponse.json({ error: "請提供 1～500 位已發薪老師姓名" }, { status: 400 });
  }

  const duplicateInput = [...new Set(requestedNames.filter((name, index) => requestedNames.indexOf(name) !== index))];
  if (duplicateInput.length > 0) {
    return NextResponse.json({ error: `匯入名單有重複姓名：${duplicateInput.join("、")}` }, { status: 400 });
  }

  await ensureTeacherExtendedColumns();
  const teachers = await prisma.teacher.findMany({
    where: { name: { in: requestedNames } },
    select: { id: true, name: true, firstPaidMonth: true, lastPaidMonth: true, lastPaidAt: true },
    orderBy: { id: "asc" },
  }) as TeacherPayoutRow[];
  const byName = new Map<string, TeacherPayoutRow[]>();
  for (const teacher of teachers) byName.set(teacher.name, [...(byName.get(teacher.name) ?? []), teacher]);

  const unmatched = requestedNames.filter((name) => !byName.has(name));
  const ambiguous = requestedNames
    .filter((name) => (byName.get(name)?.length ?? 0) > 1)
    .map((name) => ({ name, teacherIds: byName.get(name)!.map((teacher) => teacher.id) }));
  if (unmatched.length > 0 || ambiguous.length > 0) {
    return NextResponse.json({
      error: "名單未能全部唯一對應，未寫入任何資料",
      unmatched,
      ambiguous,
    }, { status: 409 });
  }

  const targets = requestedNames.map((name) => byName.get(name)![0]);
  const proposals: PayoutProposal[] = targets.map((teacher: TeacherPayoutRow) => {
    const currentFirst = teacher.firstPaidMonth?.trim() || "";
    const currentLast = teacher.lastPaidMonth?.trim() || "";
    const firstPaidMonth = !currentFirst || payoutMonth < currentFirst ? payoutMonth : currentFirst;
    const lastPaidMonth = !currentLast || payoutMonth > currentLast ? payoutMonth : currentLast;
    return {
      teacherId: teacher.id,
      name: teacher.name,
      currentFirstPaidMonth: currentFirst,
      currentLastPaidMonth: currentLast,
      firstPaidMonth,
      lastPaidMonth,
      willChange: firstPaidMonth !== currentFirst || lastPaidMonth !== currentLast,
    };
  });

  if (body?.confirm !== CONFIRM) {
    return NextResponse.json({
      mode: "dry-run",
      payoutMonth,
      sourceLabel,
      matchedCount: proposals.length,
      willChangeCount: proposals.filter((row) => row.willChange).length,
      proposals,
    });
  }

  const paidAt = monthEnd(payoutMonth);
  for (const row of proposals.filter((item) => item.willChange)) {
    const original = targets.find((teacher) => teacher.id === row.teacherId)!;
    const thisIsLatest = !original.lastPaidMonth || payoutMonth >= original.lastPaidMonth;
    await prisma.teacher.update({
      where: { id: row.teacherId },
      data: {
        firstPaidMonth: row.firstPaidMonth,
        lastPaidMonth: row.lastPaidMonth,
        ...(thisIsLatest && !original.lastPaidAt ? { lastPaidAt: paidAt } : {}),
      },
    });
  }

  await writeAuditLog(req, {
    action: "update",
    targetType: "Teacher",
    targetLabel: `${payoutMonth} 歷史匯款名單匯入`,
    diffSummary: `依「${sourceLabel}」核對 ${proposals.length} 位已發薪老師，更新 ${proposals.filter((row) => row.willChange).length} 位：${proposals.slice(0, 15).map((row) => row.name).join("、")}${proposals.length > 15 ? " 等" : ""}`,
    afterData: proposals,
    sensitive: true,
  });

  return NextResponse.json({
    mode: "executed",
    payoutMonth,
    matchedCount: proposals.length,
    updatedCount: proposals.filter((row) => row.willChange).length,
    executedBy: user?.name || user?.username || "",
    updated: proposals,
  });
}
