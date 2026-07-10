import { NextRequest, NextResponse } from "next/server";
import { calculateSalaryMonth, type SalaryResult } from "@/lib/salaryCalculation";
import { getPayrollRun } from "@/lib/payrollRun";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const year = Number(searchParams.get("year") ?? new Date().getFullYear());
  const month = Number(searchParams.get("month") ?? new Date().getMonth() + 1);
  const teacherId = Number(searchParams.get("teacherId")) || undefined;
  const includeDetails = searchParams.get("details") === "1" || Boolean(teacherId);
  if (!Number.isInteger(year) || month < 1 || month > 12) {
    return NextResponse.json({ error: "年月格式錯誤" }, { status: 400 });
  }

  // M14：已結算鎖定的月份一律回快照，之後改動出勤也不會影響歷史薪資數字
  const run = await getPayrollRun(year, month).catch(() => null);
  if (run) {
    const snapshot = JSON.parse(run.snapshot) as { year: number; month: number; payoutMonth: string; results: SalaryResult[] };
    let results = snapshot.results;
    if (teacherId) results = results.filter((row) => row.teacher.id === teacherId);
    if (!includeDetails) results = results.map((row) => ({ ...row, details: undefined }));
    return NextResponse.json({
      ...snapshot,
      results,
      locked: true,
      finalizedBy: run.finalizedBy,
      finalizedAt: run.finalizedAt,
    });
  }

  const result = await calculateSalaryMonth(year, month, { teacherId, includeDetails });
  return NextResponse.json({ ...result, locked: false });
}
