import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createAttendancesForUniqueDays } from "@/lib/attendanceBatch";
import { parseCourseDateInput, weekdayOfIso } from "@/lib/courseDates";
import { departmentQueryValues, normalizeDepartment, normalizeRegion } from "@/lib/courseMeta";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const dept = searchParams.get("dept") ?? "";
  const courses = await prisma.course.findMany({
    where: dept ? { department: { in: departmentQueryValues(dept) } } : {},
    include: { teacher: true, schoolRel: true },
    orderBy: [{ region: "asc" }, { dayOfWeek: "asc" }],
  });
  return NextResponse.json(courses);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { schoolRel, teacher, scheduledDates, ...data } = body;
  void schoolRel; void teacher;

  const scheduled: string[] = Array.isArray(scheduledDates)
    ? [...new Set((scheduledDates as string[]).map((d) => String(d).trim().slice(0, 10)).filter(Boolean))]
    : [];
  const parsed = typeof data.scheduledDateText === "string"
    ? parseCourseDateInput(data.scheduledDateText, Number(data.scheduledDateYear) || new Date().getFullYear()).dates
    : [];
  const allScheduled = [...new Set([...scheduled, ...parsed])].sort();
  const dayOfWeek = allScheduled[0] ? weekdayOfIso(allScheduled[0]) : (data.dayOfWeek ?? "");

  const course = await prisma.$transaction(async (tx) => {
    const c = await tx.course.create({
      data: {
        code: data.code,
        region: normalizeRegion(data.region),
        teacherId: Number(data.teacherId),
        school: data.school,
        schoolId: data.schoolId ? Number(data.schoolId) : null,
        courseType: data.courseType ?? "",
        address: data.address ?? "",
        dayOfWeek,
        time: data.time ?? "",
        category: data.category ?? "課後",
        department: normalizeDepartment(data.department),
        enrollCount: data.enrollCount ?? "",
        isActive: data.isActive ?? true,
        notes: data.notes ?? "",
      },
      include: { teacher: true },
    });

    if (allScheduled.length > 0) {
      await createAttendancesForUniqueDays(
        allScheduled,
        {
          courseId: c.id,
          actualTeacherId: c.teacherId,
          category: c.category,
          hours: 1,
          notes: "",
          cancelled: false,
          studentCount: null,
        },
        tx,
      );
    }

    return c;
  });

  return NextResponse.json(course, { status: 201 });
}
