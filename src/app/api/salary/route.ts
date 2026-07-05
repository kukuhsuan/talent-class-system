import { NextRequest, NextResponse } from "next/server";
import { calculateSalaryMonth } from "@/lib/salaryCalculation";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const year = Number(searchParams.get("year") ?? new Date().getFullYear());
  const month = Number(searchParams.get("month") ?? new Date().getMonth() + 1);
  const teacherId = Number(searchParams.get("teacherId")) || undefined;
  const includeDetails = searchParams.get("details") === "1" || Boolean(teacherId);
  if (!Number.isInteger(year) || month < 1 || month > 12) {
    return NextResponse.json({ error: "年月格式錯誤" }, { status: 400 });
  }
  const result = await calculateSalaryMonth(year, month, { teacherId, includeDetails });
  return NextResponse.json(result);
}
