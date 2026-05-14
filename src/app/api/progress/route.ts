import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { departmentQueryValues } from "@/lib/courseMeta";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const year = searchParams.get("year");
  const month = searchParams.get("month");
  const dept = searchParams.get("dept") ?? "";
  const school = searchParams.get("school") ?? "";
  const teacherId = searchParams.get("teacherId") ?? "";

  const where: Record<string, unknown> = { reportContent: { not: "" } };

  if (year && month) {
    const start = new Date(Number(year), Number(month) - 1, 1);
    const end = new Date(Number(year), Number(month), 1);
    where.date = { gte: start, lt: end };
  }

  const courseFilter: Record<string, unknown> = {};
  if (dept) courseFilter.department = { in: departmentQueryValues(dept) };
  if (school) courseFilter.school = school;
  if (Object.keys(courseFilter).length) where.course = courseFilter;

  if (teacherId) where.actualTeacherId = Number(teacherId);

  const records = await prisma.attendance.findMany({
    where,
    include: { course: true, actualTeacher: true },
    orderBy: [{ date: "desc" }],
  });

  return NextResponse.json(records);
}
