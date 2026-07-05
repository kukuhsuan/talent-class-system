import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";
import { courseLabel, normalizeCategory, normalizeDepartment } from "@/lib/courseMeta";
import { effectiveAttendanceTime, usableScheduledTime } from "@/lib/attendanceTime";
import { salaryHoursFromValues } from "@/lib/salaryHours";

export const runtime = "nodejs";

function safeText(value: unknown, fallback = "") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function safeDate(value: Date | string | null | undefined) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

function safeCount(value: unknown) {
  const count = Number(value ?? 0);
  return Number.isFinite(count) ? count : 0;
}

function countOf(row: { studentCount?: number | null; studentCountA?: number | null; studentCountB?: number | null }) {
  if (row.studentCountA != null || row.studentCountB != null) return safeCount(row.studentCountA) + safeCount(row.studentCountB);
  return safeCount(row.studentCount);
}

function hasStudentCount(row: { studentCount?: number | null; studentCountA?: number | null; studentCountB?: number | null }) {
  return row.studentCount != null || row.studentCountA != null || row.studentCountB != null;
}

function contentDisposition(year: number, month: number) {
  const paddedMonth = String(month).padStart(2, "0");
  const asciiName = `school-lesson-details-${year}-${paddedMonth}.xlsx`;
  const utf8Name = encodeURIComponent(`${year}年${month}月園所上課明細.xlsx`);
  return `attachment; filename="${asciiName}"; filename*=UTF-8''${utf8Name}`;
}

const thinBorder: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: "FFD7DEE8" } },
  bottom: { style: "thin", color: { argb: "FFD7DEE8" } },
  left: { style: "thin", color: { argb: "FFD7DEE8" } },
  right: { style: "thin", color: { argb: "FFD7DEE8" } },
};

function cellText(value: ExcelJS.CellValue) {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") return "text" in value ? String(value.text) : String(value);
  return String(value);
}

function fitColumns(ws: ExcelJS.Worksheet) {
  ws.columns.forEach((column) => {
    let width = 10;
    column.eachCell?.({ includeEmpty: true }, (cell) => {
      width = Math.max(width, cellText(cell.value).length + 3);
    });
    column.width = Math.min(32, width);
  });
}

function styleSectionTitle(ws: ExcelJS.Worksheet, rowNumber: number, title: string, color: string) {
  ws.mergeCells(rowNumber, 1, rowNumber, 6);
  const row = ws.getRow(rowNumber);
  row.height = 26;
  const cell = row.getCell(1);
  cell.value = title;
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: color } };
  cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 13 };
  cell.alignment = { vertical: "middle", horizontal: "left" };
  cell.border = thinBorder;
}

function styleSectionHeader(ws: ExcelJS.Worksheet, rowNumber: number) {
  const header = ws.getRow(rowNumber);
  header.height = 24;
  header.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E40AF" } };
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.alignment = { vertical: "middle", horizontal: "center" };
    cell.border = thinBorder;
  });
}

function styleSectionRows(ws: ExcelJS.Worksheet, startRow: number, endRow: number) {
  let previousSchool = "";
  let schoolGroup = -1;
  const categoryFills: Record<string, string> = {
    課內: "FFE8F5E9",
    課後: "FFE8F0FE",
    營隊: "FFF3E8FF",
    Demo: "FFFFF1D6",
  };

  for (let rowNumber = startRow; rowNumber <= endRow; rowNumber += 1) {
    const row = ws.getRow(rowNumber);
    row.height = 21;
    const school = cellText(row.getCell(2).value);
    if (school !== previousSchool) {
      schoolGroup += 1;
      previousSchool = school;
    }
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.alignment = { vertical: "middle" };
      cell.border = thinBorder;
      if (schoolGroup % 2 === 1) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
      }
    });

    const categoryCell = row.getCell(5);
    const category = cellText(categoryCell.value);
    categoryCell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: categoryFills[category] ?? "FFF1F5F9" },
    };
    categoryCell.font = { bold: true };
    categoryCell.alignment = { vertical: "middle", horizontal: "center" };
    row.getCell(6).alignment = { vertical: "middle", horizontal: "right" };
  }
}

function formatMetric(value: number) {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
}

function styleSummarySheet(ws: ExcelJS.Worksheet) {
  styleSectionHeader(ws, 1);
  let previousSchool = "";
  let schoolGroup = -1;

  for (let rowNumber = 2; rowNumber <= ws.rowCount; rowNumber += 1) {
    const row = ws.getRow(rowNumber);
    row.height = 34;
    const school = cellText(row.getCell(1).value);
    if (school !== previousSchool) {
      schoolGroup += 1;
      previousSchool = school;
    }
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.alignment = { vertical: "middle", wrapText: true };
      cell.border = thinBorder;
      if (schoolGroup % 2 === 1) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
      }
    });
    row.getCell(3).alignment = { vertical: "middle", horizontal: "center" };
    row.getCell(6).alignment = { vertical: "middle", horizontal: "right", wrapText: true };
  }

  ws.views = [{ state: "frozen", ySplit: 1 }];
  ws.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: 6 },
  };
  fitColumns(ws);
  ws.getColumn(5).width = 48;
  ws.getColumn(6).width = Math.max(ws.getColumn(6).width ?? 10, 18);
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const year = Number(searchParams.get("year") ?? new Date().getFullYear());
  const month = Number(searchParams.get("month") ?? new Date().getMonth() + 1);
  const type = searchParams.get("type") ?? "";
  const school = searchParams.get("school") ?? "";
  const courseType = searchParams.get("courseType") ?? "";
  const format = searchParams.get("format") ?? "";
  const detail = searchParams.get("detail") === "1";

  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 1);

  const records = await prisma.attendance.findMany({
    where: {
      cancelled: false,
      date: { gte: start, lt: end },
      course: {
        ...(school ? { school } : {}),
        ...(courseType ? { courseType } : {}),
      },
    },
    include: { course: { include: { schoolRel: true } }, actualTeacher: true },
    orderBy: { date: "asc" },
  }) as unknown as Array<{
    id: number;
    date: Date | string | null;
    scheduledTime?: string | null;
    studentCount: number | null;
    studentCountA: number | null;
    studentCountB: number | null;
    category: string | null;
    hours: number | null;
    isPayrollLocked?: boolean | null;
    reportContent?: string | null;
    reportSentAt?: Date | string | null;
    actualTeacher: { name: string } | null;
    course: {
      id: number;
      school: string | null;
      region: string | null;
      courseType: string | null;
      department: string | null;
      time: string | null;
      payrollHours?: number | null;
      category: string | null;
      schoolRel: { type: string } | null;
    } | null;
  }>;

  // scheduledTime / payrollHours 已在 schema 內，include 直接帶回，省 2 次資料庫來回
  const rows = records
    .map((r) => {
      const course = r.course;
      const rawCourseType = safeText(course?.courseType, "未分類課程");
      const rawSchool = safeText(course?.school, "未命名園所");
      const schoolType = course?.schoolRel?.type
        ? normalizeDepartment(course.schoolRel.type)
        : (course?.department ? normalizeDepartment(course.department) : "未分類");
      const category = normalizeCategory(course?.category ?? r.category);
      const time = effectiveAttendanceTime({
        scheduledTime: usableScheduledTime(r.scheduledTime),
        courseTime: safeText(course?.time),
        attendanceHours: r.hours,
        isPayrollLocked: r.isPayrollLocked,
        reportContent: r.reportContent,
        reportSentAt: r.reportSentAt,
        studentCount: r.studentCount,
        studentCountA: r.studentCountA,
        studentCountB: r.studentCountB,
      });
      const payrollHours = course?.id
        ? salaryHoursFromValues(r.hours, course.payrollHours, time)
        : null;
      return {
        id: r.id,
        school: rawSchool,
        schoolType,
        courseType: rawCourseType,
        courseName: courseLabel(rawCourseType),
        date: safeDate(r.date),
        studentCount: countOf(r),
        hasStudentCount: hasStudentCount(r),
        teacherName: safeText(r.actualTeacher?.name, "未填老師"),
        category,
        time,
        payrollHours,
      };
    })
    .filter((r) => !type || r.schoolType === type);

  const total = rows.reduce((sum, r) => sum + r.studentCount, 0);
  const totalLessons = rows.length;

  if (detail) {
    return NextResponse.json({
      year,
      month,
      rows: rows.map((row) => ({
        id: row.id,
        date: row.date,
        studentCount: row.studentCount,
        teacherName: row.teacherName,
      })),
    });
  }

  if (format === "xlsx") {
    const sortLessonRows = <T extends {
      school: string;
      date: string;
      courseName: string;
      teacherName: string;
    }>(lessonRows: T[]) => lessonRows.sort((a, b) => (
      a.school.localeCompare(b.school, "zh-Hant")
      || a.date.localeCompare(b.date)
      || a.courseName.localeCompare(b.courseName, "zh-Hant")
      || a.teacherName.localeCompare(b.teacherName, "zh-Hant")
    ));

    const inSchoolRows = sortLessonRows(rows
      .filter((row) => row.category === "課內")
      .map((row) => ({
        date: row.date,
        school: row.school,
        courseName: row.courseName,
        teacherName: row.teacherName,
        category: row.category,
        metric: !row.payrollHours || row.payrollHours.needsReview
          ? "需人工確認"
          : row.payrollHours.payableHours,
      })));
    const afterSchoolRows = sortLessonRows(rows
      .filter((row) => row.category !== "課內")
      .map((row) => ({
        date: row.date,
        school: row.school,
        courseName: row.courseName,
        teacherName: row.teacherName,
        category: row.category,
        metric: row.hasStudentCount ? safeCount(row.studentCount) : "未填",
      })));

    const summaryRows = Array.from(rows.reduce<Map<string, {
      school: string;
      courseName: string;
      category: string;
      teacherName: string;
      details: Array<{ date: string; metric: number | null; needsReview: boolean }>;
    }>>((groups, row) => {
      const key = JSON.stringify([row.school, row.courseName, row.category, row.teacherName]);
      const group = groups.get(key) ?? {
        school: row.school,
        courseName: row.courseName,
        category: row.category,
        teacherName: row.teacherName,
        details: [],
      };
      const isInSchool = row.category === "課內";
      group.details.push({
        date: row.date,
        metric: isInSchool
          ? row.payrollHours?.payableHours ?? null
          : row.hasStudentCount ? safeCount(row.studentCount) : null,
        needsReview: isInSchool
          ? !row.payrollHours || row.payrollHours.needsReview
          : !row.hasStudentCount,
      });
      groups.set(key, group);
      return groups;
    }, new Map()).values())
      .map((group) => {
        const isInSchool = group.category === "課內";
        const sortedDetails = group.details.sort((a, b) => a.date.localeCompare(b.date));
        const validTotal = sortedDetails.reduce((sum, detailRow) => (
          sum + (detailRow.needsReview || detailRow.metric == null ? 0 : detailRow.metric)
        ), 0);
        const missingCount = sortedDetails.filter((detailRow) => detailRow.needsReview || detailRow.metric == null).length;
        const unit = isInSchool ? "小時" : "人";
        const totalText = `${formatMetric(validTotal)}${unit}${missingCount ? `（另有${missingCount}筆需確認）` : ""}`;

        return {
          school: group.school,
          courseName: group.courseName,
          category: group.category,
          teacherName: group.teacherName,
          dateDetails: sortedDetails.map((detailRow) => (
            detailRow.needsReview || detailRow.metric == null
              ? `${detailRow.date}：${isInSchool ? "需人工確認" : "未填"}`
              : `${detailRow.date}：${formatMetric(detailRow.metric)}${unit}`
          )).join("、"),
          monthlyTotal: totalText,
        };
      })
      .sort((a, b) => (
        a.school.localeCompare(b.school, "zh-Hant")
        || a.courseName.localeCompare(b.courseName, "zh-Hant")
        || a.teacherName.localeCompare(b.teacherName, "zh-Hant")
        || a.category.localeCompare(b.category, "zh-Hant")
      ));

    const wb = new ExcelJS.Workbook();
    const summarySheet = wb.addWorksheet("園所課程總表");
    summarySheet.columns = [
      { header: "園所名稱", key: "school", width: 22 },
      { header: "課程名稱", key: "courseName", width: 16 },
      { header: "類別", key: "category", width: 10 },
      { header: "老師", key: "teacherName", width: 16 },
      { header: "日期明細", key: "dateDetails", width: 48 },
      { header: "本月合計", key: "monthlyTotal", width: 18 },
    ];
    summarySheet.addRows(summaryRows);
    styleSummarySheet(summarySheet);

    const detailSheet = wb.addWorksheet("園所上課明細");
    detailSheet.columns = [
      { key: "date", width: 14 },
      { key: "school", width: 22 },
      { key: "courseName", width: 16 },
      { key: "teacherName", width: 16 },
      { key: "category", width: 10 },
      { key: "metric", width: 14 },
    ];
    const headers = ["日期", "園所名稱", "課程名稱", "老師", "類別", "人數 / 時數"];
    const addSection = (
      title: string,
      titleColor: string,
      lessonRows: Array<{
        date: string;
        school: string;
        courseName: string;
        teacherName: string;
        category: string;
        metric: number | string;
      }>,
    ) => {
      const titleRowNumber = detailSheet.rowCount + 1;
      detailSheet.addRow([title]);
      styleSectionTitle(detailSheet, titleRowNumber, title, titleColor);

      const headerRowNumber = detailSheet.rowCount + 1;
      detailSheet.addRow(headers);
      styleSectionHeader(detailSheet, headerRowNumber);

      const startRow = detailSheet.rowCount + 1;
      detailSheet.addRows(lessonRows);
      const endRow = detailSheet.rowCount;
      if (startRow <= endRow) styleSectionRows(detailSheet, startRow, endRow);
    };

    addSection("課內課", "FF2E7D32", inSchoolRows);
    detailSheet.addRow([]);
    addSection("課後課 / 營隊", "FF6D28D9", afterSchoolRows);
    detailSheet.views = [{ state: "frozen", ySplit: 2 }];
    fitColumns(detailSheet);

    const body = await wb.xlsx.writeBuffer();
    return new NextResponse(body, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": contentDisposition(year, month),
        "Cache-Control": "no-store",
      },
    });
  }

  const groups = Object.values(rows.reduce<Record<string, {
    school: string;
    schoolType: string;
    totalLessons: number;
    totalPeople: number;
    courses: Record<string, { courseType: string; courseName: string; lessons: number; people: number; teachers: string[] }>;
  }>>((acc, row) => {
    const schoolKey = row.school || "未命名園所";
    const courseKey = row.courseType || row.courseName;
    if (!acc[schoolKey]) {
      acc[schoolKey] = { school: schoolKey, schoolType: row.schoolType, totalLessons: 0, totalPeople: 0, courses: {} };
    }
    acc[schoolKey].totalLessons += 1;
    acc[schoolKey].totalPeople += row.studentCount;
    if (!acc[schoolKey].courses[courseKey]) {
      acc[schoolKey].courses[courseKey] = { courseType: row.courseType, courseName: row.courseName, lessons: 0, people: 0, teachers: [] };
    }
    const course = acc[schoolKey].courses[courseKey];
    course.lessons += 1;
    course.people += row.studentCount;
    if (row.teacherName && !course.teachers.includes(row.teacherName)) course.teachers.push(row.teacherName);
    return acc;
  }, {})).map((group) => ({
    ...group,
    courses: Object.values(group.courses).sort((a, b) => b.people - a.people || a.courseName.localeCompare(b.courseName, "zh-Hant")),
  })).sort((a, b) => b.totalPeople - a.totalPeople || a.school.localeCompare(b.school, "zh-Hant"));

  return NextResponse.json({ year, month, total, totalLessons, groups });
}
