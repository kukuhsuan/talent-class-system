import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { OWNER_ROLES, requireRole } from "@/lib/permissions";
import { normalizeCategory } from "@/lib/courseMeta";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 一次性稽核：找出「已確認且填了代課費」的代課記錄。
 *
 * 修正前的計薪邏輯是 `代課費 ?? 時薪 × 計薪時數`，代課費一有值就整個取代應發薪資
 * （填 1 就發 1 元）。修正後代課費純屬備註，但先前月份可能已經照錯的金額發出去，
 * 這支端點把受影響的記錄列出來供人工核對。核對完可以整支移除。
 */
export async function GET() {
  const { response } = await requireRole(OWNER_ROLES);
  if (response) return response;

  const rows = await prisma.substitute.findMany({
    where: { confirmed: true, fee: { not: null } },
    select: {
      id: true, role: true, fee: true, date: true, school: true, courseType: true, notes: true,
      attendanceId: true,
      substituteTeacher: {
        select: { id: true, name: true, rateAfterSchool: true, rateInSchool: true, rateDemo: true, assistantFee: true },
      },
    },
    orderBy: { date: "desc" },
  });
  if (rows.length === 0) {
    return NextResponse.json({ total: 0, underpaid: 0, overpaid: 0, records: [] });
  }

  const attendanceIds = rows.map((row) => row.attendanceId).filter((id): id is number => Boolean(id));
  const attendances = attendanceIds.length
    ? await prisma.attendance.findMany({
        where: { id: { in: attendanceIds } },
        select: { id: true, hours: true, category: true, cancelled: true, isPayrollLocked: true },
      })
    : [];
  const attendanceById = new Map(attendances.map((row) => [row.id, row]));

  const records = rows.map((row) => {
    const attendance = row.attendanceId ? attendanceById.get(row.attendanceId) : undefined;
    const teacher = row.substituteTeacher;
    const category = normalizeCategory(attendance?.category ?? "");
    // 與 salaryCalculation 的時薪選擇一致：助教用助教費，其餘依課別分 Demo／課內／課後
    const rate = !teacher
      ? 0
      : row.role === "助教"
        ? teacher.assistantFee
        : category === "Demo"
          ? teacher.rateDemo
          : category === "課內"
            ? teacher.rateInSchool
            : teacher.rateAfterSchool;
    // 概算用出勤時數；行政單堂改過的時數不納入，實際金額仍以薪資頁為準
    const hours = attendance?.hours ?? 0;
    const correctPay = Math.round(hours * rate);
    const fee = row.fee ?? 0;
    return {
      substituteId: row.id,
      attendanceId: row.attendanceId,
      date: row.date.toISOString().slice(0, 10),
      school: row.school,
      courseType: row.courseType,
      role: row.role,
      teacher: teacher?.name ?? "（未指定代課老師）",
      category,
      hours,
      rate,
      paidBefore: fee,       // 修正前這堂實際發出的授課薪資
      correctPay,            // 修正後應發（不含車費與薪資調整）
      difference: correctPay - fee,
      cancelled: Boolean(attendance?.cancelled),
      payrollLocked: Boolean(attendance?.isPayrollLocked),
      notes: row.notes,
    };
  });

  return NextResponse.json({
    total: records.length,
    underpaid: records.filter((row) => row.difference > 0).length,
    overpaid: records.filter((row) => row.difference < 0).length,
    records,
  });
}
