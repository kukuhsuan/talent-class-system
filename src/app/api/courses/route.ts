import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createAttendancesForUniqueDays } from "@/lib/attendanceBatch";
import { stampAttendanceTime } from "@/lib/attendanceTime";
import { nextCourseCode } from "@/lib/courseCode";
import { expandIsoDateRange, expandWeeklyDates, parseCourseDateInput, weekdayOfIso } from "@/lib/courseDates";
import { departmentQueryValues, normalizeCategory, normalizeDepartment, normalizeRegion } from "@/lib/courseMeta";
import { coursePayrollHoursForAttendance, parsePayrollHours, setCoursePayrollHours } from "@/lib/payrollHours";
import { WAITING_TEACHER_NAME } from "@/lib/teacherAssignment";
import { recurrenceFields } from "@/lib/courseRecurrence";
import { courseConfirmationMapBySchoolIds, courseConfirmationSummary } from "@/lib/courseConfirmation";
import { writeAuditLog } from "@/lib/auditLog";
import { courseTermOverride, notesWithCourseTerm } from "@/lib/courseTerm";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const dept = searchParams.get("dept") ?? "";
  const page = Math.max(1, Number(searchParams.get("page") ?? "0") || 0);
  const pageSizeRaw = Number(searchParams.get("pageSize") ?? "0") || 0;
  const pageSize = pageSizeRaw ? Math.min(50, Math.max(20, pageSizeRaw)) : 0;
  const region = normalizeRegion(searchParams.get("region") ?? "");
  const search = (searchParams.get("search") ?? "").trim();
  const teacherFilter = searchParams.get("teacher") ?? "";
  const month = Number(searchParams.get("month") ?? "0") || 0;
  const year = Number(searchParams.get("year") ?? new Date().getFullYear()) || new Date().getFullYear();
  const includeDates = searchParams.get("includeDates") === "1";
  const includeConfirmation = searchParams.get("includeConfirmation") !== "0";
  if (searchParams.get("nextCode") === "1") {
    const rows = await prisma.course.findMany({ select: { code: true } });
    return NextResponse.json({ code: nextCourseCode(rows.map((r) => r.code)) });
  }

  const where: Record<string, unknown> = {};
  if (dept) where.department = { in: departmentQueryValues(dept) };
  if (region) where.region = region;
  if (teacherFilter === "unassigned") where.teacher = { is: { name: WAITING_TEACHER_NAME } };
  else if (teacherFilter) where.teacherId = Number(teacherFilter);
  if (month >= 1 && month <= 12) {
    where.attendances = {
      some: {
        date: {
          gte: new Date(Date.UTC(year, month - 1, 1)),
          lt: new Date(Date.UTC(year, month, 1)),
        },
      },
    };
  }
  if (search) {
    where.OR = [
      { code: { contains: search } },
      { school: { contains: search } },
      { courseType: { contains: search } },
      { teacher: { is: { name: { contains: search } } } },
    ];
  }

  // 精簡模式：只回傳下拉選單需要的欄位，省掉整包關聯資料（出勤頁選項載入用）
  if (searchParams.get("minimal") === "1") {
    const minimalItems = await prisma.course.findMany({
      where: where as Prisma.CourseWhereInput,
      select: {
        id: true,
        code: true,
        school: true,
        courseType: true,
        time: true,
        payrollHours: true,
        category: true,
        teacherId: true,
        assistantTeacherId: true,
        teacher: { select: { id: true, name: true } },
        assistantTeacher: { select: { id: true, name: true } },
      },
      orderBy: [{ region: "asc" }, { dayOfWeek: "asc" }],
    });
    const response = NextResponse.json(minimalItems);
    response.headers.set("Cache-Control", "no-store");
    return response;
  }

  const attendanceDateRange = month >= 1 && month <= 12
    ? {
        gte: new Date(Date.UTC(year, month - 1, 1)),
        lt: new Date(Date.UTC(year, month, 1)),
      }
    : {
        gte: new Date(Date.UTC(year, 0, 1)),
        lt: new Date(Date.UTC(year + 1, 0, 1)),
      };
  const include = {
    teacher: { select: { id: true, name: true } },
    assistantTeacher: { select: { id: true, name: true } },
    schoolRel: { select: { id: true, name: true, type: true, region: true, address: true } },
    attendances: includeDates ? {
      where: { date: attendanceDateRange },
      select: { date: true },
      orderBy: { date: "asc" as const },
    } : false,
  } satisfies Prisma.CourseInclude;
  const query = {
    where: where as Prisma.CourseWhereInput,
    include: {
      ...include,
    },
    orderBy: [{ region: "asc" as const }, { dayOfWeek: "asc" as const }],
  } satisfies Prisma.CourseFindManyArgs;

  const [courses, total] = await Promise.all([
    prisma.course.findMany({ ...query, ...(pageSize ? { skip: (page - 1) * pageSize, take: pageSize } : {}) }),
    pageSize ? prisma.course.count({ where: where as Prisma.CourseWhereInput }) : Promise.resolve(0),
  ]);
  // payrollHours 已在 schema 內，findMany 直接帶回，省一次資料庫來回
  const confirmationMap = includeConfirmation
    ? await courseConfirmationMapBySchoolIds(courses.map((course) => course.schoolId ?? 0))
    : null;
  const items = courses.map((course) => ({
    ...course,
    academicTermOverride: courseTermOverride(course.notes),
    payrollHours: course.payrollHours ?? null,
    courseConfirmationSummary: includeConfirmation && course.schoolId ? courseConfirmationSummary(confirmationMap?.get(course.schoolId), { multiline: true, includeTerm: true }) : "",
    scheduledDates: "attendances" in course ? [...new Set(course.attendances.map((a) => a.date.toISOString().slice(0, 10)))] : [],
  }));
  const response = pageSize ? NextResponse.json({ items, total, page, pageSize }) : NextResponse.json(items);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { schoolRel, teacher, assistantTeacher, scheduledDates, ...data } = body;
    void schoolRel; void teacher; void assistantTeacher;
    const requestedCode = String(data.code ?? "").trim();
    const code = requestedCode || nextCourseCode((await prisma.course.findMany({ select: { code: true } })).map((r) => r.code));

    const existing = code
      ? await prisma.course.findFirst({
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
    const payrollHours = parsePayrollHours(data.payrollHours);
    const recurrence = recurrenceFields(data, allScheduled);

    const course = await prisma.course.create({
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
        time: data.time ?? "",
        category: normalizeCategory(data.category),
        department: normalizeDepartment(data.department),
        enrollCount: data.enrollCount ?? "",
        isActive: data.isActive ?? true,
        notes: notesWithCourseTerm(data.notes, data.academicTermOverride),
      },
      include: { teacher: true, assistantTeacher: true },
    });
    await setCoursePayrollHours(course.id, payrollHours);

    const warnings: string[] = [];
    if (allScheduled.length > 0) {
      const calculatedHours = coursePayrollHoursForAttendance(payrollHours, course.time);
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
        await stampAttendanceTime(course.id, allScheduled, course.time);
      } catch (stampError) {
        const message = (stampError as Error).message || "新出勤時間標記失敗";
        console.warn("course attendance time stamp skipped", { courseId: course.id, message });
        warnings.push(`新出勤時間標記略過：${message}`);
      }
    }

    await writeAuditLog(req, {
      action: "create",
      targetType: "Course",
      targetId: course.id,
      targetLabel: `${course.code} ${course.school} ${course.courseType}`,
      afterData: { ...course, payrollHours },
      diffSummary: `新增課程：${course.code} ${course.school} ${course.courseType}`,
    });
    return NextResponse.json({ ...course, payrollHours, warnings }, { status: 201 });
  } catch (e) {
    console.error("course create failed", e);
    return NextResponse.json({ error: `課程新增失敗：${(e as Error).message}` }, { status: 500 });
  }
}
