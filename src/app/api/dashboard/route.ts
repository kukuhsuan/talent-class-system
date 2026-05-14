import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { departmentQueryValues } from "@/lib/courseMeta";

// Single endpoint for the home page — replaces 3 separate fetches
// Returns: { courses, attendance, teacherCount }
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const dept = searchParams.get("dept") ?? "";
  const year = Number(searchParams.get("year") ?? new Date().getFullYear());
  const month = Number(searchParams.get("month") ?? new Date().getMonth() + 1);

  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 1);

  const deptFilter = dept ? { department: { in: departmentQueryValues(dept) } } : {};

  // Run all three queries in parallel — one cold start, one DB connection
  const [courses, attendance, teacherCount] = await Promise.all([
    prisma.course.findMany({
      where: { isActive: true, ...deptFilter },
      select: {
        id: true, code: true, school: true, courseType: true,
        dayOfWeek: true, time: true, region: true, teacherId: true,
        teacher: { select: { id: true, name: true } },
      },
      orderBy: [{ school: "asc" }, { dayOfWeek: "asc" }],
    }),
    prisma.attendance.findMany({
      where: {
        date: { gte: monthStart, lt: monthEnd },
        ...(dept ? { course: { department: { in: departmentQueryValues(dept) } } } : {}),
      },
      select: {
        id: true, date: true, cancelled: true, studentCount: true,
        course: {
          select: {
            id: true, school: true, courseType: true, teacherId: true,
            time: true, address: true,
            teacher: { select: { id: true, name: true } },
          },
        },
        actualTeacher: { select: { id: true, name: true } },
      },
      orderBy: { date: "desc" },
    }),
    prisma.teacher.count(),
  ]);

  return NextResponse.json({ courses, attendance, teacherCount });
}
