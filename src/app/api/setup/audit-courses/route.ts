import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type CountRow = { key: string | null; count: number | bigint };
type AttendanceDuplicateRow = {
  key: string;
  code: string | null;
  school: string | null;
  date: string;
  count: number | bigint;
};

function numberCount(value: number | bigint) {
  return Number(value);
}

export async function GET() {
  const [
    totalCourses,
    totalAttendances,
    duplicateCodes,
    missingCore,
    coursesWithoutDates,
    duplicateAttendanceByCourse,
    duplicateAttendanceByCode,
  ] = await Promise.all([
    prisma.course.count(),
    prisma.attendance.count(),
    prisma.$queryRawUnsafe<CountRow[]>(
      "SELECT code AS key, COUNT(*) AS count FROM Course WHERE code IS NOT NULL AND TRIM(code) != '' GROUP BY code HAVING COUNT(*) > 1 ORDER BY count DESC, code ASC",
    ),
    prisma.course.findMany({
      where: {
        OR: [
          { code: "" },
          { school: "" },
          { courseType: "" },
          { time: "" },
          { teacherId: { lte: 0 } },
        ],
      },
      select: { id: true, code: true, school: true, courseType: true, time: true, teacherId: true },
      take: 30,
      orderBy: { id: "asc" },
    }),
    prisma.course.findMany({
      where: { attendances: { none: {} } },
      select: { id: true, code: true, school: true, courseType: true, dayOfWeek: true, time: true },
      take: 30,
      orderBy: { id: "asc" },
    }),
    prisma.$queryRawUnsafe<CountRow[]>(
      "SELECT CAST(courseId AS TEXT) AS key, COUNT(*) AS count FROM Attendance GROUP BY courseId, date HAVING COUNT(*) > 1 ORDER BY count DESC LIMIT 30",
    ),
    prisma.$queryRawUnsafe<AttendanceDuplicateRow[]>(
      "SELECT (COALESCE(Course.code, CAST(Attendance.courseId AS TEXT)) || '|' || substr(Attendance.date, 1, 10)) AS key, Course.code AS code, Course.school AS school, substr(Attendance.date, 1, 10) AS date, COUNT(*) AS count FROM Attendance LEFT JOIN Course ON Course.id = Attendance.courseId GROUP BY key HAVING COUNT(*) > 1 ORDER BY count DESC LIMIT 30",
    ),
  ]);

  return NextResponse.json({
    ok: true,
    totals: { courses: totalCourses, attendances: totalAttendances },
    duplicateCourseCodes: duplicateCodes.map((row) => ({ code: row.key, count: numberCount(row.count) })),
    missingCore,
    coursesWithoutDates,
    duplicateAttendanceByCourseIdDate: duplicateAttendanceByCourse.map((row) => ({ courseId: row.key, count: numberCount(row.count) })),
    duplicateAttendanceByCourseCodeDate: duplicateAttendanceByCode.map((row) => ({
      code: row.code,
      school: row.school,
      date: row.date,
      count: numberCount(row.count),
    })),
  });
}
