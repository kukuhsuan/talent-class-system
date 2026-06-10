import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createAttendancesForUniqueDays } from "@/lib/attendanceBatch";
import { pruneFutureUnreportedAttendanceDates, stampAttendanceTime, syncFutureUnreportedAttendanceAssistant, syncFutureUnreportedAttendanceCategory, syncFutureUnreportedAttendanceTime } from "@/lib/attendanceTime";
import { expandIsoDateRange, expandWeeklyDates, parseCourseDateInput, weekdayOfIso } from "@/lib/courseDates";
import { normalizeCategory, normalizeDepartment, normalizeRegion } from "@/lib/courseMeta";
import { coursePayrollHoursForAttendance, parsePayrollHours, setCoursePayrollHours } from "@/lib/payrollHours";
import { recurrenceFields } from "@/lib/courseRecurrence";

// GET /api/courses/[id] — returns single course with scheduledDates (for edit form)
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const course = await prisma.course.findUnique({
    where: { id: Number(id) },
    include: {
      teacher: true,
      assistantTeacher: true,
      schoolRel: true,
      attendances: { select: { date: true }, orderBy: { date: "asc" } },
    },
  });
  if (!course) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { coursePayrollHoursMap } = await import("@/lib/payrollHours");
  const payrollMap = await coursePayrollHoursMap([course.id]);

  return NextResponse.json({
    ...course,
    payrollHours: payrollMap.get(course.id) ?? null,
    scheduledDates: [...new Set(course.attendances.map((a) => a.date.toISOString().slice(0, 10)))],
  });
}

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
    const newTime = String(data.time ?? "");
    const payrollHours = parsePayrollHours(data.payrollHours);
    const recurrence = recurrenceFields(data, allScheduled);

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
        ...recurrence,
        time: newTime,
        category: normalizeCategory(data.category),
        department: normalizeDepartment(data.department),
        enrollCount: data.enrollCount ?? "",
        isActive: data.isActive ?? true,
        notes: data.notes ?? "",
      },
      include: { teacher: true, assistantTeacher: true },
    });
    await setCoursePayrollHours(course.id, payrollHours);

    const warnings: string[] = [];
    try {
      await syncFutureUnreportedAttendanceAssistant(course.id, course.assistantTeacherId ?? null, undefined, course.department);
    } catch (syncError) {
      const message = (syncError as Error).message || "未來助教同步失敗";
      console.warn("course attendance assistant sync skipped", { courseId: course.id, message });
      warnings.push(`助教同步略過：${message}`);
    }
    try {
      await syncFutureUnreportedAttendanceCategory(course.id, course.category, undefined, course.department);
    } catch (syncError) {
      const message = (syncError as Error).message || "未來課程類別同步失敗";
      console.warn("course attendance category sync skipped", { courseId: course.id, message });
      warnings.push(`課程類別同步略過：${message}`);
    }
    try {
      await syncFutureUnreportedAttendanceTime(course.id, newTime, payrollHours, undefined, course.department);
    } catch (syncError) {
      const message = (syncError as Error).message || "未來出勤時間同步失敗";
      console.warn("course attendance time sync skipped", { courseId: course.id, message });
      warnings.push(`出勤時間同步略過：${message}`);
    }

    if (allScheduled.length > 0) {
      const calculatedHours = coursePayrollHoursForAttendance(payrollHours, newTime);
      await createAttendancesForUniqueDays(allScheduled, {
        courseId: course.id,
        actualTeacherId: course.teacherId,
        assistantTeacherId: course.assistantTeacherId ?? null,
        category: normalizeCategory(course.category),
        hours: calculatedHours.hours,
        notes: calculatedHours.needsReview ? `上課時間需人工確認：${calculatedHours.reason}` : "",
        cancelled: false,
        studentCount: null,
      });
      try {
        await stampAttendanceTime(course.id, allScheduled, newTime);
      } catch (stampError) {
        const message = (stampError as Error).message || "新出勤時間標記失敗";
        console.warn("course attendance time stamp skipped", { courseId: course.id, message });
        warnings.push(`新出勤時間標記略過：${message}`);
      }
      try {
        await pruneFutureUnreportedAttendanceDates(course.id, allScheduled);
      } catch (pruneError) {
        const message = (pruneError as Error).message || "多餘未來日期移除失敗";
        console.warn("course extra future attendance prune skipped", { courseId: course.id, message });
        warnings.push(`多餘未來日期移除略過：${message}`);
      }
    }
    return NextResponse.json({ ...course, payrollHours, warnings });
  } catch (e) {
    console.error("course update failed", e);
    return NextResponse.json({ error: `課程儲存失敗：${(e as Error).message}` }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const courseId = Number(id);
    const lockedCount = await prisma.attendance.count({
      where: { courseId, isPayrollLocked: true },
    });
    if (lockedCount > 0) {
      return NextResponse.json(
        { error: `此課程有 ${lockedCount} 筆已鎖定薪資的出勤紀錄，不可刪除` },
        { status: 409 },
      );
    }
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
