import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { departmentQueryValues } from "@/lib/courseMeta";
import { courseDateWindowWhere, courseIdsWithAnyAttendance, courseOccursOnIso, dayNameOfIso } from "@/lib/scheduleLogic";
import { taipeiDateIso, utcStartOfIsoDay, utcStartOfNextIsoDay } from "@/lib/courseDates";
import { effectiveAttendanceTime, usableScheduledTime } from "@/lib/attendanceTime";
import { attendanceMissingItems, isPendingReport } from "@/lib/reportWindow";
import { isWaitingTeacherName } from "@/lib/teacherAssignment";
import { equipmentNextStopLabel, equipmentSummaryLabels } from "@/lib/equipmentReminderCore";
import { automationRunsForDates } from "@/lib/automationHealth";

export const dynamic = "force-dynamic";

// Single endpoint for the home page — replaces 3 separate fetches
// Returns the compact data needed by the home page.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const dept = searchParams.get("dept") ?? "";
  const todayIso = searchParams.get("today") ?? taipeiDateIso();
  const tomorrowDate = new Date(`${todayIso}T00:00:00.000Z`);
  tomorrowDate.setUTCDate(tomorrowDate.getUTCDate() + 1);
  const tomorrowIso = tomorrowDate.toISOString().slice(0, 10);
  const todayDayName = dayNameOfIso(todayIso);
  const todayStart = utcStartOfIsoDay(todayIso);
  const tomorrowStart = utcStartOfNextIsoDay(todayIso);
  const pendingStart = utcStartOfIsoDay(todayIso);
  pendingStart.setUTCDate(pendingStart.getUTCDate() - 2);

  const deptFilter = dept ? { department: { in: departmentQueryValues(dept) } } : {};
  const todayCourseWindow = courseDateWindowWhere(todayIso);

  // 首頁所有獨立資料一次平行讀取，避免先等主要資料、再依序等器材與排程健康度，
  // 冷啟動時可少掉兩段資料庫往返。
  const [courses, todayAttendance, pendingCandidates, teacherCount, unboundTeacherCount, datedCourseIds, changeRequestGroups, automationRuns] = await Promise.all([
    prisma.course.findMany({
      where: { isActive: true, ...todayCourseWindow, ...deptFilter },
      select: {
        id: true,
        dayOfWeek: true,
      },
    }),
    prisma.attendance.findMany({
      where: {
        date: { gte: todayStart, lt: tomorrowStart },
        ...(dept ? { course: { department: { in: departmentQueryValues(dept) } } } : {}),
      },
      select: {
        id: true, date: true, cancelled: true, reportSentAt: true,
        scheduledTime: true, hours: true,
        course: { select: { id: true, teacherId: true, startDate: true, endDate: true, school: true, courseType: true, time: true } },
        actualTeacherId: true,
        actualTeacher: { select: { name: true } },
        equipment: {
          select: {
            attendanceId: true,
            isFirstClass: true,
            needsAssembly: true,
            equipmentNote: true,
            needsTransferAfterClass: true,
            nextSchoolName: true,
            nextClassDate: true,
            nextCourseType: true,
            nextAddress: true,
            transferNote: true,
            status: true,
          },
        },
      },
    }),
    prisma.attendance.findMany({
      where: {
        cancelled: false,
        date: { gte: pendingStart, lt: tomorrowStart },
        ...(dept ? { course: { department: { in: departmentQueryValues(dept) } } } : {}),
      },
      select: {
        id: true, date: true, cancelled: true, studentCount: true, studentCountA: true, studentCountB: true, reportContent: true, reportSentAt: true, isPayrollLocked: true, category: true, hours: true,
        course: {
          select: {
            id: true,
            school: true,
            courseType: true,
            category: true,
            time: true,
            startDate: true,
            endDate: true,
          },
        },
        actualTeacher: { select: { name: true, lineUserId: true } },
      },
      orderBy: { date: "asc" },
    }),
    prisma.teacher.count(),
    prisma.teacher.count({ where: { lineUserId: null } }),
    courseIdsWithAnyAttendance({ isActive: true, ...todayCourseWindow, ...deptFilter }, todayStart),
    prisma.courseChangeRequest.groupBy({
      by: ["status"],
      where: { status: { in: ["待行政審核", "待老師回覆", "老師無法配合", "需要討論", "老師可配合"] } },
      _count: { _all: true },
    }),
    automationRunsForDates([todayIso, tomorrowIso]).catch(() => []),
  ]);

  const validTodayAttendance = todayAttendance.filter((item) => courseOccursOnIso(item.course, todayIso));
  const pendingAttendance = pendingCandidates.filter((item) => courseOccursOnIso(item.course, item.date.toISOString().slice(0, 10))).map((item) => {
    const scheduledTime = effectiveAttendanceTime({
      courseTime: item.course.time,
      attendanceHours: item.hours,
      isPayrollLocked: item.isPayrollLocked,
      reportContent: item.reportContent,
      reportSentAt: item.reportSentAt,
      studentCount: item.studentCount,
      studentCountA: item.studentCountA,
      studentCountB: item.studentCountB,
    });
    return {
      ...item,
      missingItems: attendanceMissingItems(item, scheduledTime),
      pendingReport: isPendingReport(item, scheduledTime),
    };
  })
    .filter((a) => a.pendingReport)
    .sort((a, b) => a.date.getTime() - b.date.getTime());
  const pendingFillableCount = pendingAttendance.length;
  const pendingDetails = pendingAttendance.slice(0, 5).map((a) => ({
    id: a.id,
    school: a.course.school,
    courseType: a.course.courseType,
    date: a.date.toISOString().slice(0, 10),
    teacherName: a.actualTeacher.name,
    teacherLineUserId: a.actualTeacher.lineUserId ?? null,
    time: effectiveAttendanceTime({
      courseTime: a.course.time,
      attendanceHours: a.hours,
      isPayrollLocked: a.isPayrollLocked,
      reportContent: a.reportContent,
      reportSentAt: a.reportSentAt,
      studentCount: a.studentCount,
      studentCountA: a.studentCountA,
      studentCountB: a.studentCountB,
    }),
    missingItems: a.missingItems,
  }));
  const todayCourseIds = new Set(validTodayAttendance.map((a) => a.course.id));
  for (const course of courses) {
    if (course.dayOfWeek === todayDayName && !datedCourseIds.has(course.id)) todayCourseIds.add(course.id);
  }
  const todaySubstituteCount = validTodayAttendance.filter(
    (a) => !a.cancelled && a.actualTeacherId !== a.course.teacherId && !isWaitingTeacherName(a.actualTeacher.name),
  ).length;
  const unnotifiedCount = validTodayAttendance.filter((a) => !a.cancelled && !a.reportSentAt).length;

  // 今日器材提醒：只列今日有器材設定的課
  const equipmentItems = validTodayAttendance
    .filter((a) => !a.cancelled && a.equipment)
    .map((a) => {
      const row = a.equipment!;
      return {
        id: a.id,
        time: usableScheduledTime(a.scheduledTime) || a.course.time || "",
        school: a.course.school,
        courseType: a.course.courseType,
        teacherName: a.actualTeacher.name,
        reminderLabels: equipmentSummaryLabels(row).filter((label) => label !== row.status),
        nextStop: equipmentNextStopLabel(row),
        status: row.status,
      };
    })
    .sort((a, b) => a.time.localeCompare(b.time));
  const equipment = {
    total: equipmentItems.length,
    unconfirmedCount: equipmentItems.filter((item) => item.status === "待確認").length,
    cannotHelpCount: equipmentItems.filter((item) => item.status === "無法協助").length,
    items: equipmentItems,
  };
  const automationHealth = automationRuns.map((run) => ({
    jobKey: run.jobKey,
    targetDate: run.targetDate,
    status: run.status,
    total: Number(run.total),
    success: Number(run.success),
    failed: Number(run.failed),
    details: run.details,
    ranAt: run.ranAt instanceof Date ? run.ranAt.toISOString() : String(run.ranAt),
  }));

  return NextResponse.json({
    equipment,
    automationHealth,
    todayCourseCount: todayCourseIds.size,
    todaySubstituteCount,
    pendingFillableCount,
    pendingDetails,
    unboundTeacherCount,
    unnotifiedCount,
    teacherCount,
    courseChanges: Object.fromEntries(changeRequestGroups.map((row) => [row.status, row._count._all])),
  }, {
    headers: { "Cache-Control": "private, no-store, max-age=0" },
  });
}
