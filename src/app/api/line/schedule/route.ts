import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLineConfig, pushMessage, buildScheduleMessage, buildTwoMonthScheduleMessage } from "@/lib/line";
import type { LineRegion } from "@/lib/line";
import { formatMonthDay, taipeiDateIso, weekdayOfIso } from "@/lib/courseDates";
import { regionQueryValues } from "@/lib/courseMeta";
import { courseIdsWithAnyAttendance } from "@/lib/scheduleLogic";
import { attendanceScheduledTimeMap, effectiveAttendanceTime } from "@/lib/attendanceTime";
import { courseConfirmationMapBySchoolIds, courseConfirmationSummary } from "@/lib/courseConfirmation";

const DAY_ORDER = ["星期一", "星期二", "星期三", "星期四", "星期五", "星期六", "星期日"];
const DAY_JS: Record<string, number> = {
  "星期一": 1,
  "星期二": 2,
  "星期三": 3,
  "星期四": 4,
  "星期五": 5,
  "星期六": 6,
  "星期日": 0,
};

function addIsoDays(iso: string, days: number) {
  const date = new Date(`${iso}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export async function sendScheduleLookupTest(body: { sourceTeacherName?: string; recipientTeacherName?: string }) {
  const sourceName = String(body.sourceTeacherName ?? "").trim();
  const recipientName = String(body.recipientTeacherName ?? "").trim();
  if (!sourceName || !recipientName) throw new Error("請提供 sourceTeacherName 與 recipientTeacherName");

  const [source, recipient] = await Promise.all([
    prisma.teacher.findFirst({ where: { name: { contains: sourceName } } }),
    prisma.teacher.findFirst({ where: { name: { contains: recipientName } } }),
  ]);
  if (!source) throw new Error(`找不到來源老師：${sourceName}`);
  if (!recipient) throw new Error(`找不到收件老師：${recipientName}`);
  if (!recipient.lineUserId || !recipient.lineRegion) throw new Error(`${recipient.name} 尚未綁定 LINE`);

  const targetYear = new Date().getFullYear();
  const displayMonthIndexes = [6, 7, 8];
  const periodStart = new Date(targetYear, displayMonthIndexes[0], 1);
  const periodEnd = new Date(targetYear, displayMonthIndexes[displayMonthIndexes.length - 1] + 1, 0, 23, 59, 59, 999);

  const courses = await prisma.course.findMany({
    where: {
      OR: [{ teacherId: source.id }, { assistantTeacherId: source.id }],
      isActive: true,
    },
    include: { schoolRel: true },
  }) as unknown as Array<{
    id: number; school: string; schoolId?: number | null; courseType: string; dayOfWeek: string; time: string; department: string;
    address?: string; schoolRel?: { address?: string } | null;
  }>;

  const actualRows = await prisma.attendance.findMany({
    where: {
      OR: [{ actualTeacherId: source.id }, { assistantTeacherId: source.id }],
      cancelled: false,
      date: { gte: periodStart, lte: periodEnd },
    },
    include: { course: { include: { schoolRel: true } } },
    orderBy: { date: "asc" },
  }) as unknown as Array<{
    id: number; hours?: number; isPayrollLocked?: boolean; reportContent?: string; reportSentAt?: Date | null;
    studentCount?: number | null; studentCountA?: number | null; studentCountB?: number | null;
    date: Date;
    course: { id: number; school: string; schoolId?: number | null; courseType: string; time: string; address?: string; schoolRel?: { address?: string } | null };
  }>;
  const actualTimeMap = await attendanceScheduledTimeMap(actualRows.map((row) => row.id));
  const confirmationMap = await courseConfirmationMapBySchoolIds([
    ...courses.map((course) => course.schoolId ?? 0),
    ...actualRows.map((row) => row.course.schoolId ?? 0),
  ]);
  const confirmationSummaryFor = (schoolId?: number | null) => schoolId
    ? courseConfirmationSummary(confirmationMap.get(schoolId), { multiline: true, teacher: true })
    : "";

  const displayCourses = courses;
  const displayCourseIds = new Set(displayCourses.map((course) => course.id));
  const datedCourseIds = await courseIdsWithAnyAttendance({
    isActive: true,
    id: { in: [...displayCourseIds] },
  }, periodStart);
  const fmt = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`;
  type ScheduleEntryRow = {
    date: string; dayShort: string; school: string; courseType: string; time: string; address?: string; confirmationSummary?: string; sortKey: number;
  };

  const weeks = displayMonthIndexes.map((month) => {
    const monthStart = new Date(targetYear, month, 1);
    const monthEnd = new Date(targetYear, month + 1, 0, 23, 59, 59, 999);
    const entries = [
      ...actualRows
        .filter((row) => displayCourseIds.has(row.course.id) && row.date >= monthStart && row.date <= monthEnd)
        .map((row): ScheduleEntryRow => {
          const iso = row.date.toISOString().slice(0, 10);
          const weekday = weekdayOfIso(iso);
          return {
            date: formatMonthDay(iso),
            dayShort: weekday.replace("星期", ""),
            school: row.course.school,
            courseType: row.course.courseType,
            time: effectiveAttendanceTime({
              scheduledTime: actualTimeMap.get(row.id),
              courseTime: row.course.time,
              attendanceHours: row.hours,
              isPayrollLocked: row.isPayrollLocked,
              reportContent: row.reportContent,
              reportSentAt: row.reportSentAt,
              studentCount: row.studentCount,
              studentCountA: row.studentCountA,
              studentCountB: row.studentCountB,
            }),
            address: row.course.address || row.course.schoolRel?.address || "",
            confirmationSummary: confirmationSummaryFor(row.course.schoolId),
            sortKey: row.date.getTime(),
          };
        }),
      ...displayCourses
        .filter((course) => !datedCourseIds.has(course.id))
        .filter((course) => DAY_JS[course.dayOfWeek] !== undefined)
        .flatMap((course) => {
          const rows: ScheduleEntryRow[] = [];
          const targetDay = DAY_JS[course.dayOfWeek];
          const cursor = new Date(monthStart);
          while (cursor <= monthEnd) {
            if (cursor.getDay() === targetDay) {
              rows.push({
                date: fmt(cursor),
                dayShort: course.dayOfWeek.replace("星期", ""),
                school: course.school,
                courseType: course.courseType,
                time: course.time,
                address: course.address || course.schoolRel?.address || "",
                confirmationSummary: confirmationSummaryFor(course.schoolId),
                sortKey: cursor.getTime(),
              });
            }
            cursor.setDate(cursor.getDate() + 1);
          }
          return rows;
        }),
    ];
    return {
      label: `${targetYear} 年 ${month + 1} 月`,
      month: `${month + 1}月`,
      entries: entries
        .sort((a, b) => a.sortKey - b.sortKey)
        .map(({ date, dayShort, school, courseType, time, address, confirmationSummary }) => ({ date, dayShort, school, courseType, time, address, confirmationSummary })),
    };
  });

  const cfg = getLineConfig(recipient.lineRegion as LineRegion);
  const msg = buildTwoMonthScheduleMessage({ teacherName: source.name, weeks });
  await pushMessage(recipient.lineUserId, [msg], cfg.token);
  return { ok: true, sent: 1, sourceTeacher: source.name, recipientTeacher: recipient.name, months: "7-9" };
}

export async function sendScheduleMessages(body: { teacherId?: number | string; region?: string } = {}) {
  // Compute next week's Mon–Sun range label
  const todayIso = taipeiDateIso();
  const today = new Date(`${todayIso}T00:00:00.000Z`);
  const dayOfWeek = today.getUTCDay(); // 0=Sun
  const daysUntilMon = dayOfWeek === 0 ? 1 : 8 - dayOfWeek;
  const nextMonIso = addIsoDays(todayIso, daysUntilMon);
  const nextMon = new Date(`${nextMonIso}T00:00:00.000Z`);
  const nextSun = new Date(nextMon);
  nextSun.setUTCDate(nextMon.getUTCDate() + 6);
  nextSun.setUTCHours(23, 59, 59, 999);
  const fmt = (d: Date) => `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
  const weekLabel = `${fmt(nextMon)} ~ ${fmt(nextSun)}`;

  const whereTeacher = body.teacherId ? { id: Number(body.teacherId) } : { lineUserId: { not: null } };
  const regionValues = regionQueryValues(body.region);

  const teachers = await prisma.teacher.findMany({
    where: whereTeacher as never,
    include: {
      courses: {
        where: { isActive: true, ...(regionValues.length > 0 ? { region: { in: regionValues } } : {}) },
        include: { schoolRel: true },
        orderBy: { dayOfWeek: "asc" },
      },
      assistantCourses: {
        where: { isActive: true, ...(regionValues.length > 0 ? { region: { in: regionValues } } : {}) },
        include: { schoolRel: true },
        orderBy: { dayOfWeek: "asc" },
      },
    },
  }) as unknown as Array<{
    id: number;
    name: string;
    lineUserId: string | null;
    lineRegion: string | null;
    courses: Array<{ id: number; school: string; schoolId?: number | null; courseType: string; dayOfWeek: string; time: string; address?: string; schoolRel?: { address?: string } | null }>;
    assistantCourses: Array<{ id: number; school: string; schoolId?: number | null; courseType: string; dayOfWeek: string; time: string; address?: string; schoolRel?: { address?: string } | null }>;
  }>;

  let sent = 0;
  let skipped = 0;

  for (const teacher of teachers) {
    if (!teacher.lineUserId || !teacher.lineRegion) { skipped++; continue; }
    const regularCourses = [...new Map([...teacher.courses, ...teacher.assistantCourses].map((course) => [course.id, course])).values()];
    if (regularCourses.length === 0) { skipped++; continue; }

    const actualRows = await prisma.attendance.findMany({
      where: {
        OR: [{ actualTeacherId: teacher.id }, { assistantTeacherId: teacher.id }],
        cancelled: false,
        date: { gte: nextMon, lte: nextSun },
        ...(regionValues.length > 0 ? { course: { region: { in: regionValues } } } : {}),
      },
      include: { course: { include: { schoolRel: true } } },
      orderBy: { date: "asc" },
    }) as unknown as Array<{
      id: number; hours?: number; isPayrollLocked?: boolean; reportContent?: string; reportSentAt?: Date | null;
      studentCount?: number | null; studentCountA?: number | null; studentCountB?: number | null;
      date: Date;
      course: { id: number; school: string; schoolId?: number | null; courseType: string; time: string; address?: string; schoolRel?: { address?: string } | null };
    }>;
    const scheduledTimeMap = await attendanceScheduledTimeMap(actualRows.map((attendance) => attendance.id));
    const confirmationMap = await courseConfirmationMapBySchoolIds([
      ...regularCourses.map((course) => course.schoolId ?? 0),
      ...actualRows.map((row) => row.course.schoolId ?? 0),
    ]);
    const confirmationSummaryFor = (schoolId?: number | null) => schoolId
      ? courseConfirmationSummary(confirmationMap.get(schoolId), { multiline: true, teacher: true })
      : "";

    const teacherCourseIds = regularCourses.map((course) => course.id);
    const datedCourseIds = await courseIdsWithAnyAttendance({
      isActive: true,
      id: { in: teacherCourseIds },
    });

    const sorted = [
      ...actualRows.map((a) => {
        const iso = a.date.toISOString().slice(0, 10);
        return {
          school: a.course.school,
          courseType: a.course.courseType,
          dayOfWeek: weekdayOfIso(iso),
          dateLabel: formatMonthDay(iso),
          time: effectiveAttendanceTime({
            scheduledTime: scheduledTimeMap.get(a.id),
            courseTime: a.course.time,
            attendanceHours: a.hours,
            isPayrollLocked: a.isPayrollLocked,
            reportContent: a.reportContent,
            reportSentAt: a.reportSentAt,
            studentCount: a.studentCount,
            studentCountA: a.studentCountA,
            studentCountB: a.studentCountB,
          }),
          address: a.course.address || a.course.schoolRel?.address || "",
          confirmationSummary: confirmationSummaryFor(a.course.schoolId),
        };
      }),
      ...regularCourses
        .filter((course) => !datedCourseIds.has(course.id))
        .sort((a, b) => DAY_ORDER.indexOf(a.dayOfWeek) - DAY_ORDER.indexOf(b.dayOfWeek))
        .map((c) => ({ ...c, address: c.address || c.schoolRel?.address || "", confirmationSummary: confirmationSummaryFor(c.schoolId) })),
    ].sort((a, b) => DAY_ORDER.indexOf(a.dayOfWeek) - DAY_ORDER.indexOf(b.dayOfWeek));

    const cfg = getLineConfig(teacher.lineRegion as LineRegion);
    const msg = buildScheduleMessage({
      teacherName: teacher.name,
      weekLabel,
      courses: sorted,
    });

    await pushMessage(teacher.lineUserId, [msg], cfg.token);
    sent++;
  }

  return { ok: true, sent, skipped, weekLabel };
}

// POST /api/line/schedule
// body: { teacherId? } — omit to send to all bound teachers
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  try {
    if (body?.type === "lookup_test") return NextResponse.json(await sendScheduleLookupTest(body));
    return NextResponse.json(await sendScheduleMessages(body));
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message || "課表傳送失敗" }, { status: 400 });
  }
}
