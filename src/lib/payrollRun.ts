import { prisma } from "@/lib/prisma";
import { calculateSalaryMonth } from "@/lib/salaryCalculation";

/**
 * 薪資結算快照（M14）
 *
 * 問題：薪資每次即時重算，發完薪水後若有人改出勤，歷史數字會默默改變，無憑據可對。
 * 解法：行政按「結算鎖定」→ 當下薪資計算結果整包存進 PayrollRun（JSON 快照），
 *       並鎖定該月全部出勤（isPayrollLocked）。之後薪資頁一律讀快照，直到解鎖。
 * 解鎖：僅 owner/super_admin/developer，會刪除快照並解鎖出勤，動作寫入操作歷程。
 */

export type PayrollRunRow = {
  id: number;
  year: number;
  month: number;
  payoutMonth: string;
  snapshot: string;
  finalizedBy: string;
  finalizedAt: string;
};

let payrollRunTableReady = false;

export async function ensurePayrollRunTable() {
  if (payrollRunTableReady) return;
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "PayrollRun" (
      "id" INTEGER PRIMARY KEY AUTOINCREMENT,
      "year" INTEGER NOT NULL,
      "month" INTEGER NOT NULL,
      "payoutMonth" TEXT NOT NULL UNIQUE,
      "snapshot" TEXT NOT NULL DEFAULT '',
      "finalizedBy" TEXT NOT NULL DEFAULT '',
      "finalizedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  payrollRunTableReady = true;
}

function payoutMonthOf(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function monthRange(year: number, month: number) {
  return { start: new Date(year, month - 1, 1), end: new Date(year, month, 1) };
}

export async function getPayrollRun(year: number, month: number): Promise<PayrollRunRow | null> {
  await ensurePayrollRunTable();
  const rows = await prisma.$queryRawUnsafe<PayrollRunRow[]>(
    'SELECT * FROM "PayrollRun" WHERE "payoutMonth" = ? LIMIT 1',
    payoutMonthOf(year, month),
  );
  return rows[0] ?? null;
}

/** 結算鎖定：建立快照並鎖定該月出勤。已鎖定的月份會拋錯。 */
export async function finalizePayrollMonth(year: number, month: number, actorName: string) {
  await ensurePayrollRunTable();
  const existing = await getPayrollRun(year, month);
  if (existing) throw new Error(`${year}年${month}月已於 ${String(existing.finalizedAt).slice(0, 16).replace("T", " ")} 由 ${existing.finalizedBy} 結算鎖定`);

  const result = await calculateSalaryMonth(year, month, { includeDetails: true });
  const reviewCount = result.results.reduce((sum, row) => sum + row.hoursReviewCount, 0);
  if (reviewCount > 0) throw new Error(`尚有 ${reviewCount} 筆時數需人工確認，請先處理完再結算鎖定`);

  await prisma.$executeRawUnsafe(
    `INSERT INTO "PayrollRun" ("year", "month", "payoutMonth", "snapshot", "finalizedBy")
     VALUES (?, ?, ?, ?, ?)`,
    year,
    month,
    payoutMonthOf(year, month),
    JSON.stringify(result),
    actorName,
  );

  const { start, end } = monthRange(year, month);
  const locked = await prisma.attendance.updateMany({
    where: { date: { gte: start, lt: end } },
    data: { isPayrollLocked: true },
  });
  return { lockedAttendances: locked.count, teacherCount: result.results.filter((row) => row.hasActivity).length };
}

/** 解鎖：刪除快照並解鎖該月出勤（含先前個別鎖定的出勤，解鎖後薪資恢復即時重算）。 */
export async function unlockPayrollMonth(year: number, month: number) {
  await ensurePayrollRunTable();
  const existing = await getPayrollRun(year, month);
  if (!existing) throw new Error(`${year}年${month}月尚未結算鎖定`);

  await prisma.$executeRawUnsafe('DELETE FROM "PayrollRun" WHERE "payoutMonth" = ?', payoutMonthOf(year, month));
  const { start, end } = monthRange(year, month);
  const unlocked = await prisma.attendance.updateMany({
    where: { date: { gte: start, lt: end } },
    data: { isPayrollLocked: false },
  });
  return { unlockedAttendances: unlocked.count, previousRun: existing };
}
