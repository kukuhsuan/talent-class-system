import ExcelJS from "exceljs";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { calculateSalaryMonth } from "@/lib/salaryCalculation";
import { getPayrollRun } from "@/lib/payrollRun";
import { listSchoolInvoices } from "@/lib/schoolInvoices";
import { normalizeCategory, requiresStudentCount } from "@/lib/courseMeta";

export const runtime = "nodejs";

type AttendanceRow = {
  date: Date;
  cancelled: boolean;
  studentCount: number | null;
  studentCountA: number | null;
  studentCountB: number | null;
  reportContent: string;
  category: string;
  hours: number;
  course: { school: string; category: string };
};

function people(row: AttendanceRow) {
  if (row.studentCountA != null || row.studentCountB != null) return Number(row.studentCountA ?? 0) + Number(row.studentCountB ?? 0);
  return Number(row.studentCount ?? 0);
}

async function monthEndData(year: number, month: number) {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  const [attendanceRaw, salary, invoices, payrollRun] = await Promise.all([
    prisma.attendance.findMany({
      where: { date: { gte: start, lt: end } },
      select: {
        date: true, cancelled: true, studentCount: true, studentCountA: true, studentCountB: true,
        reportContent: true, category: true, hours: true, course: { select: { school: true, category: true } },
      },
      orderBy: { date: "asc" },
    }),
    calculateSalaryMonth(year, month),
    listSchoolInvoices({ year, month }),
    getPayrollRun(year, month).catch(() => null),
  ]);
  const attendance = attendanceRaw as AttendanceRow[];
  const active = attendance.filter((row) => !row.cancelled);
  const today = new Date();
  const schoolMap = new Map<string, { lessons: number; people: number; inSchoolHours: number; missingCount: number; missingReport: number; invoiceRequired: boolean }>();
  for (const row of active) {
    const name = row.course.school || "未命名園所";
    const current = schoolMap.get(name) ?? { lessons: 0, people: 0, inSchoolHours: 0, missingCount: 0, missingReport: 0, invoiceRequired: false };
    current.lessons += 1;
    const category = row.category || row.course.category;
    const isDemo = normalizeCategory(category) === "Demo";
    if (!isDemo) current.invoiceRequired = true;
    if (!isDemo && requiresStudentCount(category)) current.people += people(row);
    else if (!isDemo) current.inSchoolHours += Number(row.hours ?? 0);
    if (row.date < today && !isDemo && requiresStudentCount(category) && row.studentCount == null && row.studentCountA == null && row.studentCountB == null) current.missingCount += 1;
    if (row.date < today && !String(row.reportContent ?? "").trim()) current.missingReport += 1;
    schoolMap.set(name, current);
  }
  const validInvoices = invoices.filter((invoice) => invoice.status !== "已作廢");
  const invoiceNames = new Set(validInvoices.map((invoice) => invoice.schoolName));
  const schools = [...schoolMap.entries()].map(([school, value]) => ({
    school, ...value, invoiceCreated: invoiceNames.has(school),
  })).sort((a, b) => a.school.localeCompare(b.school, "zh-TW"));
  const salaryRows = salary.results.filter((row) => row.hasActivity);
  const hoursReviewCount = salaryRows.reduce((sum, row) => sum + row.hoursReviewCount, 0);
  const unreportedCount = salaryRows.reduce((sum, row) => sum + row.unreportedCount, 0);
  const missingStudentCount = schools.reduce((sum, row) => sum + row.missingCount, 0);
  const missingInvoices = schools.filter((row) => row.invoiceRequired && !row.invoiceCreated).map((row) => row.school);

  return {
    year, month,
    attendance: {
      lessons: active.length,
      cancelled: attendance.length - active.length,
      people: active.reduce((sum, row) => {
        const category = row.category || row.course.category;
        return sum + (normalizeCategory(category) !== "Demo" && requiresStudentCount(category) ? people(row) : 0);
      }, 0),
      inSchoolHours: schools.reduce((sum, row) => sum + row.inSchoolHours, 0),
      schools: schools.length,
      missingStudentCount,
    },
    salary: {
      teachers: salaryRows.length,
      total: salaryRows.reduce((sum, row) => sum + row.total, 0),
      hoursReviewCount,
      unreportedCount,
      locked: Boolean(payrollRun),
      rows: salaryRows.map((row) => ({ teacher: row.teacher.name, hours: row.regularHours + row.demoHours + row.assistantHours, total: row.total, review: row.hoursReviewCount, unreported: row.unreportedCount })),
    },
    invoices: {
      count: validInvoices.length,
      total: validInvoices.reduce((sum, invoice) => sum + Number(invoice.totalAmount), 0),
      missing: missingInvoices,
      rows: validInvoices.map((invoice) => ({ id: invoice.id, school: invoice.schoolName, status: invoice.status, total: Number(invoice.totalAmount) })),
    },
    schools,
    ready: missingStudentCount === 0 && hoursReviewCount === 0 && missingInvoices.length === 0,
  };
}

function money(value: number) {
  return value.toLocaleString("zh-TW");
}

async function workbookResponse(data: Awaited<ReturnType<typeof monthEndData>>) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "WaysLeader AI";
  const summary = workbook.addWorksheet("月結總覽");
  summary.addRows([
    ["月底會計包", `${data.year} 年 ${data.month} 月`],
    ["狀態", data.ready ? "可結帳" : "尚有待辦"],
    ["上課堂數", data.attendance.lessons], ["總人次", data.attendance.people], ["園所數", data.attendance.schools],
    ["薪資人數", data.salary.teachers], ["薪資總額", data.salary.total], ["薪資已鎖定", data.salary.locked ? "是" : "否"],
    ["請款單數", data.invoices.count], ["請款總額", data.invoices.total],
    ["課內時數", data.attendance.inSchoolHours], ["缺課後人數", data.attendance.missingStudentCount], ["待確認時數", data.salary.hoursReviewCount], ["未建請款單", data.invoices.missing.length],
  ]);
  const schools = workbook.addWorksheet("園所人數與請款");
  schools.addRow(["園所", "堂數", "課後學生人次", "課內時數", "缺課後人數", "請款單"]);
  data.schools.forEach((row) => schools.addRow([row.school, row.lessons, row.people, row.inSchoolHours, row.missingCount, row.invoiceRequired ? (row.invoiceCreated ? "已建立" : "未建立") : "Demo 免請款"]));
  const salaries = workbook.addWorksheet("老師薪資");
  salaries.addRow(["老師", "計薪時數", "薪資", "待確認時數", "缺回報"]);
  data.salary.rows.forEach((row) => salaries.addRow([row.teacher, row.hours, row.total, row.review, row.unreported]));
  const invoices = workbook.addWorksheet("請款單");
  invoices.addRow(["編號", "園所", "狀態", "金額"]);
  data.invoices.rows.forEach((row) => invoices.addRow([row.id, row.school, row.status, row.total]));
  for (const sheet of workbook.worksheets) {
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E40AF" } };
    sheet.columns.forEach((column) => { column.width = 18; });
  }
  summary.getColumn(2).width = 24;
  const buffer = await workbook.xlsx.writeBuffer();
  const filename = encodeURIComponent(`${data.year}年${data.month}月月底會計包.xlsx`);
  return new NextResponse(Buffer.from(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="month-end-${data.year}-${String(data.month).padStart(2, "0")}.xlsx"; filename*=UTF-8''${filename}`,
      "X-Accounting-Summary": `${money(data.salary.total)}-${money(data.invoices.total)}`,
    },
  });
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const year = Number(searchParams.get("year") ?? new Date().getFullYear());
  const month = Number(searchParams.get("month") ?? new Date().getMonth() + 1);
  if (!Number.isInteger(year) || month < 1 || month > 12) return NextResponse.json({ error: "年月格式錯誤" }, { status: 400 });
  const data = await monthEndData(year, month);
  return searchParams.get("format") === "xlsx" ? workbookResponse(data) : NextResponse.json(data);
}
