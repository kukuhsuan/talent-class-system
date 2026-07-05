import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { coursePayrollHoursMap } from "@/lib/payrollHours";
import { resolvePayrollHours } from "@/lib/payrollHoursCore";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const year = Number(searchParams.get("year") ?? "0");
  const month = Number(searchParams.get("month") ?? "0");
  const limit = Math.min(1000, Math.max(20, Number(searchParams.get("limit") ?? 500)));

  const validMonth = year > 0 && month >= 1 && month <= 12;
  const dateWhere = validMonth
    ? { gte: new Date(Date.UTC(year, month - 1, 1)), lt: new Date(Date.UTC(year, month, 1)) }
    : undefined;
  const attendances = await prisma.attendance.findMany({
    where: { ...(dateWhere ? { date: dateWhere } : {}), cancelled: false },
    select: {
      id: true,
      date: true,
      hours: true,
      isPayrollLocked: true,
      reportContent: true,
      studentCount: true,
      studentCountA: true,
      studentCountB: true,
      actualTeacher: { select: { name: true } },
      course: {
        select: {
          id: true,
          code: true,
          school: true,
          courseType: true,
          time: true,
        },
      },
    },
    orderBy: { date: "asc" },
  });
  const payrollMap = await coursePayrollHoursMap(attendances.map((attendance) => attendance.course.id));

  const rows = attendances.map((attendance) => {
    const coursePayrollHours = payrollMap.get(attendance.course.id);
    const suggested = resolvePayrollHours(null, coursePayrollHours, attendance.course.time);
    const current = Number(attendance.hours ?? 0);
    const mismatch = coursePayrollHours != null && Math.abs(current - coursePayrollHours) > 0.01;
    return {
      attendanceId: attendance.id,
      courseCode: attendance.course.code,
      school: attendance.course.school,
      teacher: attendance.actualTeacher.name,
      date: attendance.date.toISOString().slice(0, 10),
      attendanceHours: current,
      coursePayrollHours,
      mismatchType: current === 1 && Number(coursePayrollHours ?? 0) > 1
        ? "Attendance.hours = 1，但 Course.payrollHours > 1"
        : mismatch ? "Attendance.hours 與 Course.payrollHours 不一致" : "",
      isPayrollLocked: attendance.isPayrollLocked,
      needsReview: suggested.needsReview,
      reviewReason: suggested.reason,
      needsUpdate: mismatch,
    };
  });

  const needsUpdate = rows.filter((row) => row.needsUpdate);
  const needsReview = rows.filter((row) => row.needsReview);
  const attendanceOneCourseAboveOne = needsUpdate.filter((row) => row.attendanceHours === 1 && Number(row.coursePayrollHours ?? 0) > 1);

  return NextResponse.json({
    dryRun: true,
    scope: validMonth ? { year, month } : "all",
    note: "此報表只讀取資料，不會修改 Attendance.hours。",
    summary: {
      total: rows.length,
      mismatched: needsUpdate.length,
      attendanceOneCourseAboveOne: attendanceOneCourseAboveOne.length,
      needsReview: needsReview.length,
      lockedMismatches: needsUpdate.filter((row) => row.isPayrollLocked).length,
    },
    items: needsUpdate.slice(0, limit),
    reviewItems: needsReview.slice(0, limit),
  });
}
