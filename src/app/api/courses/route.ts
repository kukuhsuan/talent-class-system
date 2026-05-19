import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createAttendancesForUniqueDays } from "@/lib/attendanceBatch";
import { expandIsoDateRange, expandWeeklyDates, parseCourseDateInput, weekdayOfIso } from "@/lib/courseDates";
import { departmentQueryValues, normalizeCategory, normalizeDepartment, normalizeRegion } from "@/lib/courseMeta";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const dept = searchParams.get("dept") ?? "";
  const courses = await prisma.course.findMany({
    where: dept ? { department: { in: departmentQueryValues(dept) } } : {},
    include: {
      teacher: true,
      schoolRel: true,
      attendances: { select: { date: true }, orderBy: { date: "asc" } },
    },
    orderBy: [{ region: "asc" }, { dayOfWeek: "asc" }],
  });
  return NextResponse.json(courses.map((course) => ({
    ...course,
    scheduledDates: course.attendances.map((a) => a.date.toISOString().slice(0, 10)),
  })));
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { schoolRel, teacher, scheduledDates, ...data } = body;
    void schoolRel; void teacher;
    const code = String(data.code ?? "").trim();

    const existing = code
      ? await prisma.course.findUnique({
          where: { code },
          include: { teacher: { select: { name: true } } },
        })
      : null;
    if (existing) {
      return NextResponse.json(
        {
          error: `課程編號「${code}」已存在（${existing.school}｜${existing.teacher.name}）。請編輯原課程新增日期，或改用新的課程編號。`,
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

    const course = await prisma.$transaction(async (tx) => {
      const c = await tx.course.create({
        data: {
          code,
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

    return NextResponse.json(course, { status: 201 });
  } catch (e) {
    console.error("course create failed", e);
    return NextResponse.json({ error: `課程新增失敗：${(e as Error).message}` }, { status: 500 });
  }
}
