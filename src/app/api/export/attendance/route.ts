import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import ExcelJS from "exceljs";
import { courseLabel, normalizeCategory, normalizeRegion } from "@/lib/courseMeta";
import { isWaitingTeacherName } from "@/lib/teacherAssignment";

function contentDisposition(year: number, month: number) {
  const paddedMonth = String(month).padStart(2, "0");
  const asciiName = `attendance-${year}-${paddedMonth}.xlsx`;
  const utf8Name = encodeURIComponent(`${year}年${month}月出勤紀錄.xlsx`);
  return `attachment; filename="${asciiName}"; filename*=UTF-8''${utf8Name}`;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const year = Number(searchParams.get("year") ?? new Date().getFullYear());
  const month = Number(searchParams.get("month") ?? new Date().getMonth() + 1);
  const school = searchParams.get("school") ?? "";
  const teacherId = searchParams.get("teacherId") ?? "";
  const date = searchParams.get("date") ?? "";
  const category = searchParams.get("category") ?? "";
  const status = searchParams.get("status") ?? "";
  const dept = searchParams.get("dept") ?? "";

  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 1);
  const where: Record<string, unknown> = { date: { gte: start, lt: end } };
  const courseFilter: Record<string, unknown> = {};
  if (school) courseFilter.school = school;
  if (dept) courseFilter.department = dept;
  if (teacherId) where.actualTeacherId = Number(teacherId);
  if (category) where.category = normalizeCategory(category);
  if (date) {
    const dayStart = new Date(`${date.slice(0, 10)}T00:00:00.000Z`);
    const dayEnd = new Date(dayStart);
    dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);
    where.date = { gte: dayStart, lt: dayEnd };
  }
  if (status === "cancelled") where.cancelled = true;
  else if (status) where.cancelled = false;
  if (Object.keys(courseFilter).length > 0) where.course = courseFilter;

  const records = await prisma.attendance.findMany({
    where,
    include: { course: { include: { teacher: true } }, actualTeacher: true, substitutes: { select: { role: true } } },
    orderBy: { date: "asc" },
  });
  const filteredRecords = records.filter((r) => {
    const isSub = r.substitutes.some((record) => record.role === "主教");
    const hasReport = Boolean(r.reportContent?.trim());
    const isDone = r.cancelled || hasReport;
    if (status === "substitute") return isSub;
    if (status === "done") return isDone;
    if (status === "missing") return !r.cancelled && !isDone;
    return true;
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

  filteredRecords.forEach((r) => {
    const isSub = r.actualTeacherId !== r.course.teacherId && !isWaitingTeacherName(r.actualTeacher.name);
    const row = ws.addRow({
      date: r.date.toISOString().slice(0, 10),
      code: r.course.code,
      school: r.course.school,
      courseType: courseLabel(r.course.courseType),
      region: normalizeRegion(r.course.region),
      mainTeacher: r.course.teacher.name,
      actualTeacher: r.actualTeacher.name,
      isSub: isSub ? "是" : "",
      category: normalizeCategory(r.category),
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
      "Content-Disposition": contentDisposition(year, month),
      "Cache-Control": "no-store",
    },
  });
}
