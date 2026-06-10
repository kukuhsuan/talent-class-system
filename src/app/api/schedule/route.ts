import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { formatMonthDay, weekdayOfIso } from "@/lib/courseDates";
import { departmentQueryValues, regionQueryValues } from "@/lib/courseMeta";
import { courseIdsWithAnyAttendance, isoDatesBetween } from "@/lib/scheduleLogic";
import { attendanceScheduledTimeMap } from "@/lib/attendanceTime";

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
  const fromIso = from.toISOString().slice(0, 10);
  const toIso = to.toISOString().slice(0, 10);

  const courseWhere = {
    isActive: true,
    ...(regionValues.length > 0 ? { region: { in: regionValues } } : {}),
    ...(dept ? { department: { in: departmentQueryValues(dept) } } : {}),
  };

  const attendances = await prisma.attendance.findMany({
    where: {
      cancelled: false,
      date: { gte: from, lte: to },
      course: courseWhere,
    },
    include: { course: { include: { teacher: true, assistantTeacher: true, schoolRel: true } } },
    orderBy: { date: "asc" },
  }) as unknown as Array<{
    id: number;
    date: Date;
    course: {
      id: number; code: string; region: string; school: string; courseType: string; address?: string;
      dayOfWeek: string; time: string; category: string; enrollCount: string; teacherId: number;
      teacher: { id: number; name: string };
      assistantTeacher?: { id: number; name: string } | null;
      assistantTeacherId?: number | null;
      schoolRel?: { address?: string } | null;
    };
  }>;

  const datedCourseIds = await courseIdsWithAnyAttendance(courseWhere, from);
  const scheduledTimeMap = await attendanceScheduledTimeMap(attendances.map((attendance) => attendance.id));
  const actualItems = attendances.map((a) => {
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
        time: scheduledTimeMap.get(a.id) || a.course.time,
        category: a.course.category,
        enrollCount: a.course.enrollCount,
        teacherId: a.course.teacherId,
        teacher: a.course.teacher,
        assistantTeacherId: a.course.assistantTeacherId ?? null,
        assistantTeacher: a.course.assistantTeacher ?? null,
      };
    });

  const courses = await prisma.course.findMany({
    where: {
      ...courseWhere,
      ...(datedCourseIds.size > 0 ? { id: { notIn: [...datedCourseIds] } } : {}),
    },
    include: { teacher: true, assistantTeacher: true, schoolRel: true },
    orderBy: [{ region: "asc" }, { school: "asc" }, { dayOfWeek: "asc" }],
  }) as unknown as Array<{
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
