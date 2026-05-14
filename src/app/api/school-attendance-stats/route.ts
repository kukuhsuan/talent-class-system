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
    reportContent: string;
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
        reportContent: r.reportContent,
        teacherName: r.actualTeacher.name,
      };
    })
    .filter((r) => !type || r.schoolType === type);

  const total = rows.reduce((sum, r) => sum + r.studentCount, 0);
  const totalLessons = rows.length;

  if (format === "xlsx") {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(`${year}年${month}月園所人數`);
    ws.columns = [
      { header: "園所名稱", key: "school", width: 20 },
      { header: "園所類型", key: "schoolType", width: 12 },
      { header: "課程名稱", key: "courseName", width: 14 },
      { header: "上課日期", key: "date", width: 14 },
      { header: "出席人數", key: "studentCount", width: 10 },
      { header: "課程進度", key: "reportContent", width: 34 },
      { header: "老師", key: "teacherName", width: 12 },
    ];
    ws.addRows(rows);
    ws.addRow({});
    ws.addRow({ school: "本月總堂數", studentCount: totalLessons });
    ws.addRow({ school: "本月總人數", studentCount: total });
    const buf = await wb.xlsx.writeBuffer();
    return new NextResponse(buf, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${year}年${month}月園所上課人數.xlsx"`,
      },
    });
  }

  return NextResponse.json({ year, month, total, totalLessons, rows });
}
