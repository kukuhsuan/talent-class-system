import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createAttendancesForUniqueDays } from "@/lib/attendanceBatch";
import { expandIsoDateRange, expandWeeklyDates, parseCourseDateInput, weekdayOfIso } from "@/lib/courseDates";
import { normalizeCategory, normalizeDepartment, normalizeRegion } from "@/lib/courseMeta";

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
  const range = data.dateMode === "range" ? expandIsoDateRange(data.rangeStart ?? "", data.rangeEnd ?? "") : [];
  const weekly = data.dateMode === "weekly" ? expandWeeklyDates(data.recurringStart ?? "", data.recurringEnd ?? "", Array.isArray(data.recurringDays) ? data.recurringDays : []) : [];
  const allScheduled = [...new Set([...scheduled, ...parsed, ...range, ...weekly])].sort();
  const dayOfWeek = allScheduled[0] ? weekdayOfIso(allScheduled[0]) : (data.dayOfWeek ?? "");

  const course = await prisma.$transaction(async (tx) => {
    const c = await tx.course.update({
      where: { id: Number(id) },
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
        category: normalizeCategory(data.category),
        department: normalizeDepartment(data.department),
        enrollCount: data.enrollCount ?? "",
        isActive: data.isActive ?? true,
        notes: data.notes ?? "",
      },
      include: { teacher: true },
    });

    if (allScheduled.length > 0) {
      await tx.attendance.deleteMany({
        where: {
          courseId: c.id,
          studentCount: null,
          reportContent: "",
          notes: "",
        },
      });
      await createAttendancesForUniqueDays(
        allScheduled,
        {
          courseId: c.id,
          actualTeacherId: c.teacherId,
          category: normalizeCategory(c.category),
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
  await prisma.$transaction(async (tx) => {
    await tx.attendance.deleteMany({ where: { courseId: Number(id) } });
    await tx.course.delete({ where: { id: Number(id) } });
  });
  return NextResponse.json({ ok: true });
}
