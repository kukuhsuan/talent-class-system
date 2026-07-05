import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { courseLabel } from "@/lib/courseMeta";
import { calculateSalaryMonth } from "@/lib/salaryCalculation";
import { writeAuditLog } from "@/lib/auditLog";

export const runtime = "nodejs";

async function buildSalaryExport(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const year = Number(searchParams.get("year") ?? new Date().getFullYear());
  const month = Number(searchParams.get("month") ?? new Date().getMonth() + 1);

  const salary = await calculateSalaryMonth(year, month, { includeDetails: true });

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(`${year}年${month}月薪資`);
  const detailWs = wb.addWorksheet("薪資明細");

  // Header style
  const headerFill: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E40AF" } };
  const headerFont: Partial<ExcelJS.Font> = { bold: true, color: { argb: "FFFFFFFF" }, name: "Arial", size: 11 };
  const borderStyle: Partial<ExcelJS.Borders> = {
    top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" },
  };

  ws.columns = [
    { header: "老師姓名", key: "name", width: 14 },
    { header: "正課計薪時數", key: "regularHours", width: 14 },
    { header: "代課計薪時數", key: "subHours", width: 14 },
    { header: "助教計薪時數", key: "assistantHours", width: 14 },
    { header: "Demo計薪時數", key: "demoHours", width: 14 },
    { header: "課程薪資", key: "regularPay", width: 14 },
    { header: "助教薪資", key: "assistantPay", width: 14 },
    { header: "Demo薪資", key: "demoPay", width: 14 },
    { header: "交通費", key: "travelPay", width: 12 },
    { header: "補發／扣款", key: "adjustmentTotal", width: 14 },
    { header: "合計", key: "total", width: 14 },
    { header: "需人工確認", key: "reviewCount", width: 14 },
  ];

  detailWs.columns = [
    { header: "老師姓名", key: "teacherName", width: 14 },
    { header: "日期", key: "date", width: 12 },
    { header: "園所", key: "school", width: 24 },
    { header: "課程", key: "courseType", width: 14 },
    { header: "類別", key: "category", width: 10 },
    { header: "身份", key: "role", width: 10 },
    { header: "上課時間", key: "time", width: 16 },
    { header: "計薪時數", key: "hours", width: 10 },
    { header: "時薪", key: "rate", width: 10 },
    { header: "車費", key: "travelPay", width: 10 },
    { header: "金額", key: "amount", width: 12 },
    { header: "備註", key: "note", width: 24 },
  ];

  // Style header row
  ws.getRow(1).eachCell((cell) => {
    cell.fill = headerFill;
    cell.font = headerFont;
    cell.alignment = { horizontal: "center" };
    cell.border = borderStyle;
  });
  detailWs.getRow(1).eachCell((cell) => {
    cell.fill = headerFill;
    cell.font = headerFont;
    cell.alignment = { horizontal: "center" };
    cell.border = borderStyle;
  });

  let grandTotal = 0;

  salary.results.filter((result) => result.hasActivity).forEach((result) => {
    const { teacher, regularHours, subHours, assistantHours, demoHours, regularPay, assistantPay, demoPay, travelPay, adjustmentTotal, total } = result;
    grandTotal += total;
    const row = ws.addRow({ name: teacher.name, regularHours, subHours, assistantHours, demoHours, regularPay, assistantPay, demoPay, travelPay, adjustmentTotal, total, reviewCount: result.hoursReviewCount });
    row.eachCell((cell) => { cell.border = borderStyle; cell.font = { name: "Arial", size: 10 }; });
    row.getCell("total").font = { bold: true, name: "Arial", size: 10 };

    (result.details ?? []).forEach((detail) => {
      const detailRow = detailWs.addRow({
        teacherName: teacher.name,
        date: detail.date.toISOString().slice(0, 10), school: detail.school,
        courseType: courseLabel(detail.courseType), category: detail.category, role: detail.role,
        time: detail.time, hours: detail.hoursNeedsReview ? "需人工確認" : detail.hours,
        rate: detail.rate, travelPay: detail.travelFee, amount: detail.amount,
        note: detail.hoursNeedsReview ? detail.hoursReviewReason : detail.notes,
      });
      detailRow.eachCell((cell) => { cell.border = borderStyle; cell.font = { name: "Arial", size: 10 }; });
    });
    result.adjustments.forEach((adjustment) => {
      const detailRow = detailWs.addRow({ teacherName: teacher.name, date: adjustment.payoutMonth,
        school: adjustment.reason, courseType: adjustment.type, category: "薪資調整", role: "—",
        time: `歸屬 ${adjustment.targetMonth}`, hours: "—", rate: "—", travelPay: 0,
        amount: adjustment.amount, note: adjustment.notes });
      detailRow.eachCell((cell) => { cell.border = borderStyle; cell.font = { name: "Arial", size: 10 }; });
    });
  });

  // Grand total row
  const totalRow = ws.addRow({ name: "合計", regularHours: "", subHours: "", demoHours: "", regularPay: "", demoPay: "", travelPay: "", total: grandTotal });
  totalRow.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } };
    cell.font = { bold: true, name: "Arial", size: 10 };
    cell.border = borderStyle;
  });

  const buf = await wb.xlsx.writeBuffer();
  const paddedMonth = String(month).padStart(2, "0");
  return new NextResponse(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="salary-${year}-${paddedMonth}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const year = Number(searchParams.get("year") ?? new Date().getFullYear());
    const month = Number(searchParams.get("month") ?? new Date().getMonth() + 1);
    const response = await buildSalaryExport(req);
    await writeAuditLog(req, {
      action: "export",
      targetType: "Salary",
      targetLabel: `${year}-${String(month).padStart(2, "0")}`,
      diffSummary: `匯出 ${year} 年 ${month} 月薪資`,
      sensitive: true,
    });
    return response;
  } catch (error) {
    console.error("Salary export failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "薪資匯出失敗" },
      { status: 500 },
    );
  }
}
