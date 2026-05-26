import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createAttendancesForUniqueDays } from "@/lib/attendanceBatch";
import { expandIsoDateRange, expandWeeklyDates, parseCourseDateInput, weekdayOfIso } from "@/lib/courseDates";
import { normalizeCategory, normalizeDepartment, normalizeRegion } from "@/lib/courseMeta";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { schoolRel, teacher, assistantTeacher, scheduledDates, ...data } = await req.json();
    void schoolRel; void teacher; void assistantTeacher;
    const courseId = Number(id);
    const code = String(data.code ?? "").trim();

    const existing = code
      ? await prisma.course.findFirst({
          where: { code },
          include: { teacher: { select: { name: true } } },
        })
      : null;
    if (existing && existing.id !== courseId) {
      return NextResponse.json(
        {
          error: `課程編號「${code}」已被其他課程使用（${existing.school}｜${existing.teacher.name}）。請改用新的課程編號。`,
        },
        { status: 409 },
      );
    }

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

    const course = await prisma.course.update({
      where: { id: courseId },
      data: {
        code,
        region: normalizeRegion(data.region),
        teacherId: Number(data.teacherId),
        assistantTeacherId: data.assistantTeacherId ? Number(data.assistantTeacherId) : null,
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
      include: { teacher: true, assistantTeacher: true },
    });

    await prisma.attendance.updateMany({
      where: { courseId: course.id },
      data: { assistantTeacherId: course.assistantTeacherId ?? null },
    });

    if (allScheduled.length > 0) {
      await createAttendancesForUniqueDays(allScheduled, {
        courseId: course.id,
        actualTeacherId: course.teacherId,
        assistantTeacherId: course.assistantTeacherId ?? null,
        category: normalizeCategory(course.category),
        hours: 1,
        notes: "",
        cancelled: false,
        studentCount: null,
      });
    }
    return NextResponse.json(course);
  } catch (e) {
    console.error("course update failed", e);
    return NextResponse.json({ error: `課程儲存失敗：${(e as Error).message}` }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const courseId = Number(id);
    await prisma.$transaction(async (tx) => {
      await tx.attendance.deleteMany({ where: { courseId } });
      await tx.course.delete({ where: { id: courseId } });
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("course delete failed", e);
    return NextResponse.json({ error: `課程刪除失敗：${(e as Error).message}` }, { status: 500 });
  }
}
