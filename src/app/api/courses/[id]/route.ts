import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createAttendancesForUniqueDays } from "@/lib/attendanceBatch";
import { parseCourseDateInput, weekdayOfIso } from "@/lib/courseDates";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { schoolRel, teacher, scheduledDates, ...data } = await req.json();
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
    const c = await tx.course.update({
      where: { id: Number(id) },
      data: {
        code: data.code,
        region: data.region ?? "",
        teacherId: Number(data.teacherId),
        school: data.school,
        schoolId: data.schoolId ? Number(data.schoolId) : null,
        courseType: data.courseType ?? "",
        address: data.address ?? "",
        dayOfWeek,
        time: data.time ?? "",
        category: data.category ?? "課後",
        department: data.department ?? "幼兒園",
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
  return NextResponse.json(course);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await prisma.course.delete({ where: { id: Number(id) } });
  return NextResponse.json({ ok: true });
}
