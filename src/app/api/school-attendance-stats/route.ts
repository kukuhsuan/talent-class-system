import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";
import { courseLabel, normalizeDepartment } from "@/lib/courseMeta";

function countOf(row: { studentCount: number | null; studentCountA?: number | null; studentCountB?: number | null }) {
  if (row.studentCountA != null || row.studentCountB != null) return (row.studentCountA ?? 0) + (row.studentCountB ?? 0);
  return row.studentCount ?? 0;
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
    date: Date;
    studentCount: number | null;
    studentCountA: number | null;
    studentCountB: number | null;
    actualTeacher: { name: string };
    course: {
      school: string;
      courseType: string;
      department: string;
      schoolRel: { type: string } | null;
    };
  }>;

  const rows = records
    .map((r) => {
      const schoolType = r.course.schoolRel?.type ? normalizeDepartment(r.course.schoolRel.type) : (r.course.department ? normalizeDepartment(r.course.department) : "未分類");
      return {
        id: r.id,
        school: r.course.school,
        schoolType,
        courseType: r.course.courseType,
        courseName: courseLabel(r.course.courseType),
        date: r.date.toISOString().slice(0, 10),
        studentCount: countOf(r),
        teacherName: r.actualTeacher.name,
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
    const exportRows = rows.length > 0
      ? rows.map((row) => ({
          school: row.school,
          courseName: row.courseName,
          teacherName: row.teacherName,
          date: row.date,
          studentCount: row.studentCount,
          lessonCount: 1,
        }))
      : [{
          school: school || "全部園所",
          courseName: courseType ? courseLabel(courseType) : "全部課程",
          teacherName: "",
          date: "",
          studentCount: total,
          lessonCount: totalLessons,
        }];
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(`${year}年${month}月園所人數`);
    ws.columns = [
      { header: "園所名稱", key: "school", width: 22 },
      { header: "課程名稱", key: "courseName", width: 16 },
      { header: "老師", key: "teacherName", width: 14 },
      { header: "日期", key: "date", width: 14 },
      { header: "出席人數", key: "studentCount", width: 10 },
      { header: "堂數", key: "lessonCount", width: 8 },
    ];
    ws.addRows(exportRows);
    ws.addRow({});
    ws.addRow({ school: "本月總計", studentCount: total, lessonCount: totalLessons });
    ws.getRow(1).font = { bold: true };
    ws.getRow(1).alignment = { vertical: "middle", horizontal: "center" };
    ws.getColumn("studentCount").numFmt = "0";
    ws.getColumn("lessonCount").numFmt = "0";
    const buf = await wb.xlsx.writeBuffer();
    return new NextResponse(buf, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${year}年${month}月園所上課人數.xlsx"`,
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
