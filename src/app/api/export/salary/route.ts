import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import ExcelJS from "exceljs";
import { normalizeCategory } from "@/lib/courseMeta";

type TeacherRow = { id: number; name: string; rateAfterSchool: number; rateInSchool: number; rateDemo: number; travelFee: number; isAssistant: boolean; assistantFee: number };
type AttendanceRow = { id: number; actualTeacherId: number; cancelled: boolean; category: string; hours: number; course: { teacherId: number } };

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const year = Number(searchParams.get("year") ?? new Date().getFullYear());
  const month = Number(searchParams.get("month") ?? new Date().getMonth() + 1);

  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 1);

  const [teachers, attendancesRaw] = await Promise.all([
    prisma.teacher.findMany({ orderBy: { name: "asc" } }),
    prisma.attendance.findMany({ where: { date: { gte: start, lt: end } }, include: { course: true } }),
  ]);

  const attendances = attendancesRaw as unknown as AttendanceRow[];

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(`${year}年${month}月薪資`);

  // Header style
  const headerFill: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E40AF" } };
  const headerFont: Partial<ExcelJS.Font> = { bold: true, color: { argb: "FFFFFFFF" }, name: "Arial", size: 11 };
  const borderStyle: Partial<ExcelJS.Borders> = {
    top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" },
  };

  ws.columns = [
    { header: "老師姓名", key: "name", width: 14 },
    { header: "正課時數", key: "regularHours", width: 12 },
    { header: "代課時數", key: "subHours", width: 12 },
    { header: "Demo時數", key: "demoHours", width: 12 },
    { header: "課程薪資", key: "regularPay", width: 14 },
    { header: "Demo薪資", key: "demoPay", width: 14 },
    { header: "交通費", key: "travelPay", width: 12 },
    { header: "合計", key: "total", width: 14 },
  ];

  // Style header row
  ws.getRow(1).eachCell((cell) => {
    cell.fill = headerFill;
    cell.font = headerFont;
    cell.alignment = { horizontal: "center" };
    cell.border = borderStyle;
  });

  let grandTotal = 0;

  (teachers as unknown as TeacherRow[]).forEach((teacher) => {
    const myRecords = attendances.filter((a) => a.actualTeacherId === teacher.id && !a.cancelled);
    const regularRecords = myRecords.filter((a) => normalizeCategory(a.category) !== "Demo");
    const demoRecords = myRecords.filter((a) => normalizeCategory(a.category) === "Demo");
    const subRecords = regularRecords.filter((a) => a.course.teacherId !== teacher.id);

    if (myRecords.length === 0) return;

    const regularHours = regularRecords.reduce((s, a) => s + a.hours, 0);
    const demoHours = demoRecords.reduce((s, a) => s + a.hours, 0);
    const subHours = subRecords.reduce((s, a) => s + a.hours, 0);
    const regularPay = teacher.isAssistant
      ? myRecords.reduce((s, a) => s + a.hours * teacher.assistantFee, 0)
      : regularRecords.reduce((s, a) => s + a.hours * (normalizeCategory(a.category) === "課內" ? teacher.rateInSchool : teacher.rateAfterSchool), 0);
    const demoPay = teacher.isAssistant ? 0 : demoHours * teacher.rateDemo;
    const travelPay = teacher.isAssistant ? 0 : regularHours * teacher.travelFee;
    const total = regularPay + demoPay + travelPay;

    grandTotal += total;

    const row = ws.addRow({ name: teacher.name, regularHours, subHours, demoHours, regularPay, demoPay, travelPay, total });
    row.eachCell((cell) => { cell.border = borderStyle; cell.font = { name: "Arial", size: 10 }; });
    row.getCell("total").font = { bold: true, name: "Arial", size: 10 };
  });

  // Grand total row
  const totalRow = ws.addRow({ name: "合計", regularHours: "", subHours: "", demoHours: "", regularPay: "", demoPay: "", travelPay: "", total: grandTotal });
  totalRow.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } };
    cell.font = { bold: true, name: "Arial", size: 10 };
    cell.border = borderStyle;
  });

  const buf = await wb.xlsx.writeBuffer();
  return new NextResponse(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${year}年${month}月薪資.xlsx"`,
    },
  });
}
