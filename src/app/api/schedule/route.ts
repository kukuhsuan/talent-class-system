import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { formatMonthDay, weekdayOfIso } from "@/lib/courseDates";
import { departmentQueryValues, regionQueryValues } from "@/lib/courseMeta";
import { courseIdsWithAnyAttendance, isoDatesBetween } from "@/lib/scheduleLogic";
import { effectiveAttendanceTime, usableScheduledTime } from "@/lib/attendanceTime";

const MS_PER_DAY = 86400000;
const DEFAULT_RANGE_DAYS = 7;
const MAX_RANGE_DAYS = 31;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const region = searchParams.get("region") ?? "";
  const dept = searchParams.get("dept") ?? "";
  const regionValues = regionQueryValues(region);
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");
  const from = fromParam ? new Date(`${fromParam}T00:00:00.000Z`) : new Date();
  if (Number.isNaN(from.getTime())) {
    return NextResponse.json({ error: "from 日期格式錯誤" }, { status: 400 });
  }
  from.setUTCHours(0, 0, 0, 0);
  const requestedTo = toParam
    ? new Date(`${toParam}T23:59:59.999Z`)
    : new Date(from.getTime() + (DEFAULT_RANGE_DAYS - 1) * MS_PER_DAY + (MS_PER_DAY - 1));
  if (Number.isNaN(requestedTo.getTime())) {
    return NextResponse.json({ error: "to 日期格式錯誤" }, { status: 400 });
  }
  const maxTo = new Date(from.getTime() + (MAX_RANGE_DAYS - 1) * MS_PER_DAY + (MS_PER_DAY - 1));
  const to = requestedTo > maxTo ? maxTo : requestedTo;
  if (to < from) {
    return NextResponse.json({ error: "to 不可早於 from" }, { status: 400 });
  }
  const fromIso = from.toISOString().slice(0, 10);
  const toIso = to.toISOString().slice(0, 10);

  const courseWhere = {
    isActive: true,
    ...(regionValues.length > 0 ? { region: { in: regionValues } } : {}),
    ...(dept ? { department: { in: departmentQueryValues(dept) } } : {}),
  };

  // 只取 id/name，避免把老師的銀行帳號、鐘點費等敏感欄位傳到瀏覽器，也大幅縮小回應
  const teacherSelect = { select: { id: true, name: true } };

  const [attendancesRaw, datedCourseIds] = await Promise.all([
    prisma.attendance.findMany({
      where: {
        cancelled: false,
        date: { gte: from, lte: to },
        course: courseWhere,
      },
      include: {
        actualTeacher: teacherSelect,
        assistantTeacher: teacherSelect,
        substitutes: { select: { id: true, role: true, originalTeacherId: true, substituteTeacherId: true } },
        course: { include: { teacher: teacherSelect, assistantTeacher: teacherSelect, schoolRel: { select: { address: true } } } },
      },
      orderBy: { date: "asc" },
    }),
    courseIdsWithAnyAttendance(courseWhere, from),
  ]);
  const attendances = attendancesRaw as unknown as Array<{
    id: number;
    scheduledTime?: string | null;
    scheduledSchoolId?: number | null; scheduledSchoolName?: string | null; scheduledAddress?: string | null; scheduledLocation?: string | null;
    date: Date; hours?: number; isPayrollLocked?: boolean; reportContent?: string; reportSentAt?: Date | null;
    studentCount?: number | null; studentCountA?: number | null; studentCountB?: number | null;
    actualTeacher?: { id: number; name: string } | null;
    assistantTeacher?: { id: number; name: string } | null;
    substitutes?: Array<{ id: number; role: string; originalTeacherId: number; substituteTeacherId: number }>;
    course: {
      id: number; code: string; region: string; school: string; courseType: string; address?: string;
      dayOfWeek: string; time: string; category: string; enrollCount: string; teacherId: number;
      teacher: { id: number; name: string };
      assistantTeacher?: { id: number; name: string } | null;
      assistantTeacherId?: number | null;
      schoolRel?: { address?: string } | null;
    };
  }>;

  // scheduledTime 已在 schema 內，findMany 直接帶回，省一次資料庫來回
  const coursesRaw = await prisma.course.findMany({
    where: {
      ...courseWhere,
      ...(datedCourseIds.size > 0 ? { id: { notIn: [...datedCourseIds] } } : {}),
    },
    include: { teacher: teacherSelect, assistantTeacher: teacherSelect, schoolRel: { select: { address: true } } },
    orderBy: [{ region: "asc" }, { school: "asc" }, { dayOfWeek: "asc" }],
  });
  const actualItems = attendances.map((a) => {
      const iso = a.date.toISOString().slice(0, 10);
      const mainSubstitute = a.substitutes?.find((substitute) => substitute.role === "主教") ?? null;
      const assistantSubstitute = a.substitutes?.find((substitute) => substitute.role === "助教") ?? null;
      const actualTeacher = a.actualTeacher ?? a.course.teacher;
      const actualAssistantTeacher = a.assistantTeacher ?? a.course.assistantTeacher ?? null;
      return {
        id: a.id,
        courseId: a.course.id,
        code: a.course.code,
        region: a.course.region,
        school: a.scheduledSchoolName?.trim() || a.course.school,
        courseType: a.course.courseType,
        address: a.scheduledAddress?.trim() || a.course.address || a.course.schoolRel?.address || "",
        location: a.scheduledLocation?.trim() || "",
        dayOfWeek: weekdayOfIso(iso),
        date: iso,
        dateLabel: formatMonthDay(iso),
        time: effectiveAttendanceTime({
          scheduledTime: usableScheduledTime(a.scheduledTime),
          courseTime: a.course.time,
          attendanceHours: a.hours,
          isPayrollLocked: a.isPayrollLocked,
          reportContent: a.reportContent,
          reportSentAt: a.reportSentAt,
          studentCount: a.studentCount,
          studentCountA: a.studentCountA,
          studentCountB: a.studentCountB,
        }),
        category: a.course.category,
        enrollCount: a.course.enrollCount,
        teacherId: actualTeacher.id,
        teacher: actualTeacher,
        originalTeacher: mainSubstitute ? a.course.teacher : null,
        isSubstitute: Boolean(mainSubstitute),
        assistantTeacherId: actualAssistantTeacher?.id ?? null,
        assistantTeacher: actualAssistantTeacher,
        originalAssistantTeacher: assistantSubstitute ? a.course.assistantTeacher ?? null : null,
        isAssistantSubstitute: Boolean(assistantSubstitute),
      };
    });

  const courses = coursesRaw as unknown as Array<{
    id: number; code: string; region: string; school: string; courseType: string; address?: string;
    dayOfWeek: string; time: string; category: string; enrollCount: string; teacherId: number;
    teacher: { id: number; name: string };
    assistantTeacher?: { id: number; name: string } | null;
    assistantTeacherId?: number | null;
    schoolRel?: { address?: string } | null;
  }>;

  const rangeDates = isoDatesBetween(fromIso, toIso);
  const recurringItems = courses.flatMap((c) => rangeDates
    .filter((iso) => weekdayOfIso(iso) === c.dayOfWeek)
    .map((iso) => ({
      ...c,
      courseId: c.id,
      address: c.address || c.schoolRel?.address || "",
      date: iso,
      dateLabel: formatMonthDay(iso),
    })));

  return NextResponse.json([...actualItems, ...recurringItems].sort((a, b) =>
    (a.date || "").localeCompare(b.date || "") || (a.time || "").localeCompare(b.time || "")
  ));
}
