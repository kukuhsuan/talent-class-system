import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";
import { courseLabel, normalizeDepartment } from "@/lib/courseMeta";

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

function contentDisposition(year: number, month: number) {
  const paddedMonth = String(month).padStart(2, "0");
  const asciiName = `school-attendance-${year}-${paddedMonth}.xlsx`;
  const utf8Name = encodeURIComponent(`${year}年${month}月園所上課人數.xlsx`);
  return `attachment; filename="${asciiName}"; filename*=UTF-8''${utf8Name}`;
}

function styleSheet(ws: ExcelJS.Worksheet) {
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).alignment = { vertical: "middle", horizontal: "center" };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  ws.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: ws.columnCount },
  };
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
    studentCount: number | null;
    studentCountA: number | null;
    studentCountB: number | null;
    actualTeacher: { name: string } | null;
    course: {
      school: string | null;
      courseType: string | null;
      department: string | null;
      schoolRel: { type: string } | null;
    } | null;
  }>;

  const rows = records
    .map((r) => {
      const course = r.course;
      const rawCourseType = safeText(course?.courseType, "未分類課程");
      const rawSchool = safeText(course?.school, "未命名園所");
      const schoolType = course?.schoolRel?.type
        ? normalizeDepartment(course.schoolRel.type)
        : (course?.department ? normalizeDepartment(course.department) : "未分類");
      return {
        id: r.id,
        school: rawSchool,
        schoolType,
        courseType: rawCourseType,
        courseName: courseLabel(rawCourseType),
        date: safeDate(r.date),
        studentCount: countOf(r),
        teacherName: safeText(r.actualTeacher?.name, "未填老師"),
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
    const detailRows = rows
      .map((row) => ({
        school: row.school,
        courseName: row.courseName,
        teacherName: row.teacherName,
        date: row.date,
        studentCount: safeCount(row.studentCount),
        lessonCount: 1,
      }))
      .sort((a, b) => (
        a.school.localeCompare(b.school, "zh-Hant")
        || a.courseName.localeCompare(b.courseName, "zh-Hant")
        || a.date.localeCompare(b.date)
        || a.teacherName.localeCompare(b.teacherName, "zh-Hant")
      ));

    const summaryRows = Object.values(detailRows.reduce<Record<string, {
      school: string;
      courseName: string;
      teacherNames: Set<string>;
      dates: Set<string>;
      studentCount: number;
      lessonCount: number;
    }>>((acc, row) => {
      const key = `${row.school}::${row.courseName}`;
      if (!acc[key]) {
        acc[key] = {
          school: row.school,
          courseName: row.courseName,
          teacherNames: new Set<string>(),
          dates: new Set<string>(),
          studentCount: 0,
          lessonCount: 0,
        };
      }
      acc[key].studentCount += row.studentCount;
      acc[key].lessonCount += row.lessonCount;
      if (row.teacherName) acc[key].teacherNames.add(row.teacherName);
      if (row.date) acc[key].dates.add(row.date);
      return acc;
    }, {})).map((row) => ({
      school: row.school,
      courseName: row.courseName,
      teacherName: Array.from(row.teacherNames).join("、") || "未填老師",
      dates: Array.from(row.dates).sort().join("、"),
      studentCount: row.studentCount,
      lessonCount: row.lessonCount,
    })).sort((a, b) => (
      a.school.localeCompare(b.school, "zh-Hant")
      || a.courseName.localeCompare(b.courseName, "zh-Hant")
    ));

    if (summaryRows.length === 0) {
      summaryRows.push({
        school: school || "全部園所",
        courseName: courseType ? courseLabel(courseType) : "全部課程",
        teacherName: "未填老師",
        dates: "",
        studentCount: total,
        lessonCount: totalLessons,
      });
    }

    const wb = new ExcelJS.Workbook();
    const summarySheet = wb.addWorksheet("園所課程統計");
    summarySheet.columns = [
      { header: "園所名稱", key: "school", width: 22 },
      { header: "課程名稱", key: "courseName", width: 16 },
      { header: "出席總人數", key: "studentCount", width: 12 },
      { header: "堂數", key: "lessonCount", width: 8 },
      { header: "老師", key: "teacherName", width: 22 },
      { header: "上課日期", key: "dates", width: 42 },
    ];
    summarySheet.addRows(summaryRows);
    summarySheet.addRow({});
    summarySheet.addRow({ school: "本月總計", studentCount: total, lessonCount: totalLessons });
    summarySheet.getColumn("studentCount").numFmt = "0";
    summarySheet.getColumn("lessonCount").numFmt = "0";
    styleSheet(summarySheet);

    const detailSheet = wb.addWorksheet("日期明細");
    detailSheet.columns = [
      { header: "園所名稱", key: "school", width: 22 },
      { header: "課程名稱", key: "courseName", width: 16 },
      { header: "日期", key: "date", width: 14 },
      { header: "出席人數", key: "studentCount", width: 10 },
      { header: "老師", key: "teacherName", width: 14 },
      { header: "堂數", key: "lessonCount", width: 8 },
    ];
    detailSheet.addRows(detailRows.length > 0 ? detailRows : [{
      school: school || "全部園所",
      courseName: courseType ? courseLabel(courseType) : "全部課程",
      date: "",
      studentCount: total,
      teacherName: "未填老師",
      lessonCount: totalLessons,
    }]);
    detailSheet.addRow({});
    detailSheet.addRow({ school: "本月總計", studentCount: total, lessonCount: totalLessons });
    detailSheet.getColumn("studentCount").numFmt = "0";
    detailSheet.getColumn("lessonCount").numFmt = "0";
    styleSheet(detailSheet);

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
