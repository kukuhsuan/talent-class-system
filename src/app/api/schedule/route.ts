import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { formatMonthDay, weekdayOfIso } from "@/lib/courseDates";
import { departmentQueryValues, regionQueryValues } from "@/lib/courseMeta";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const region = searchParams.get("region") ?? "";
  const dept = searchParams.get("dept") ?? "";
  const regionValues = regionQueryValues(region);
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");
  const from = fromParam ? new Date(`${fromParam}T00:00:00.000Z`) : new Date();
  from.setHours(0, 0, 0, 0);
  const to = toParam ? new Date(`${toParam}T23:59:59.999Z`) : new Date(from.getTime() + 120 * 86400000);

  const attendances = await prisma.attendance.findMany({
    where: {
      cancelled: false,
      date: { gte: from, lte: to },
      course: {
        isActive: true,
        ...(regionValues.length > 0 ? { region: { in: regionValues } } : {}),
        ...(dept ? { department: { in: departmentQueryValues(dept) } } : {}),
      },
    },
    include: { course: { include: { teacher: true, schoolRel: true } } },
    orderBy: { date: "asc" },
  }) as unknown as Array<{
    id: number;
    date: Date;
    course: {
      id: number; code: string; region: string; school: string; courseType: string; address?: string;
      dayOfWeek: string; time: string; category: string; enrollCount: string; teacherId: number;
      teacher: { id: number; name: string };
      schoolRel?: { address?: string } | null;
    };
  }>;

  if (attendances.length > 0) {
    return NextResponse.json(attendances.map((a) => {
      const iso = a.date.toISOString().slice(0, 10);
      return {
        id: a.id,
        courseId: a.course.id,
        code: a.course.code,
        region: a.course.region,
        school: a.course.school,
        courseType: a.course.courseType,
        address: a.course.address || a.course.schoolRel?.address || "",
        dayOfWeek: weekdayOfIso(iso),
        date: iso,
        dateLabel: formatMonthDay(iso),
        time: a.course.time,
        category: a.course.category,
        enrollCount: a.course.enrollCount,
        teacherId: a.course.teacherId,
        teacher: a.course.teacher,
      };
    }));
  }

  const courses = await prisma.course.findMany({
    where: {
      isActive: true,
      ...(regionValues.length > 0 ? { region: { in: regionValues } } : {}),
      ...(dept ? { department: { in: departmentQueryValues(dept) } } : {}),
    },
    include: { teacher: true, schoolRel: true },
    orderBy: [{ region: "asc" }, { school: "asc" }, { dayOfWeek: "asc" }],
  }) as unknown as Array<{
    id: number; code: string; region: string; school: string; courseType: string; address?: string;
    dayOfWeek: string; time: string; category: string; enrollCount: string; teacherId: number;
    teacher: { id: number; name: string };
    schoolRel?: { address?: string } | null;
  }>;

  return NextResponse.json(courses.map((c) => ({
    ...c,
    courseId: c.id,
    address: c.address || c.schoolRel?.address || "",
    date: "",
    dateLabel: "",
  })));
}
