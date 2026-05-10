import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import ExcelJS from "exceljs";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const year = Number(searchParams.get("year") ?? new Date().getFullYear());
  const month = Number(searchParams.get("month") ?? new Date().getMonth() + 1);

  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 1);

  const records = await prisma.attendance.findMany({
    where: { date: { gte: start, lt: end } },
    include: { course: { include: { teacher: true } }, actualTeacher: true },
    orderBy: { date: "asc" },
  });

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(`${year}年${month}月出勤`);

  const headerFill: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E40AF" } };
  const headerFont: Partial<ExcelJS.Font> = { bold: true, color: { argb: "FFFFFFFF" }, name: "Arial", size: 11 };
  const border: Partial<ExcelJS.Borders> = {
    top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" },
  };

  ws.columns = [
    { header: "日期", key: "date", width: 14 },
    { header: "課程編號", key: "code", width: 12 },
    { header: "學校", key: "school", width: 16 },
    { header: "課程項目", key: "courseType", width: 12 },
    { header: "地區", key: "region", width: 10 },
    { header: "負責老師", key: "mainTeacher", width: 12 },
    { header: "上課老師", key: "actualTeacher", width: 12 },
    { header: "代課", key: "isSub", width: 8 },
    { header: "類別", key: "category", width: 8 },
    { header: "時數", key: "hours", width: 8 },
    { header: "出席人數", key: "studentCount", width: 10 },
    { header: "停課", key: "cancelled", width: 8 },
    { header: "備註", key: "notes", width: 20 },
  ];

  ws.getRow(1).eachCell((cell) => {
    cell.fill = headerFill;
    cell.font = headerFont;
    cell.alignment = { horizontal: "center" };
    cell.border = border;
  });

  records.forEach((r) => {
    const isSub = r.actualTeacherId !== r.course.teacherId;
    const row = ws.addRow({
      date: r.date.toISOString().slice(0, 10),
      code: r.course.code,
      school: r.course.school,
      courseType: r.course.courseType,
      region: r.course.region,
      mainTeacher: r.course.teacher.name,
      actualTeacher: r.actualTeacher.name,
      isSub: isSub ? "是" : "",
      category: r.category,
      hours: r.hours,
      studentCount: r.studentCount ?? "",
      cancelled: r.cancelled ? "是" : "",
      notes: r.notes,
    });
    row.eachCell((cell) => { cell.border = border; cell.font = { name: "Arial", size: 10 }; });
    if (r.cancelled) row.eachCell((cell) => { cell.font = { name: "Arial", size: 10, color: { argb: "FF9CA3AF" } }; });
    if (isSub) row.getCell("actualTeacher").font = { name: "Arial", size: 10, bold: true, color: { argb: "FFD97706" } };
  });

  const buf = await wb.xlsx.writeBuffer();
  return new NextResponse(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${year}年${month}月出勤紀錄.xlsx"`,
    },
  });
}
