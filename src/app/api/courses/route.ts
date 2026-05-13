import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createAttendancesForUniqueDays } from "@/lib/attendanceBatch";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const dept = searchParams.get("dept") ?? "";
  const courses = await prisma.course.findMany({
    where: dept ? { department: dept } : {},
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

  const course = await prisma.$transaction(async (tx) => {
    const c = await tx.course.create({
      data: {
        code: data.code,
        region: data.region ?? "",
        teacherId: Number(data.teacherId),
        school: data.school,
        schoolId: data.schoolId ? Number(data.schoolId) : null,
        courseType: data.courseType ?? "",
        dayOfWeek: data.dayOfWeek ?? "",
        time: data.time ?? "",
        category: data.category ?? "課後",
        department: data.department ?? "幼兒園",
        enrollCount: data.enrollCount ?? "",
        isActive: data.isActive ?? true,
        notes: data.notes ?? "",
      },
      include: { teacher: true },
    });

    if (scheduled.length > 0) {
      await createAttendancesForUniqueDays(
        scheduled,
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
