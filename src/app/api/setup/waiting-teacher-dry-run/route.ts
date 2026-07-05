import { NextRequest, NextResponse } from "next/server";
import { normalizeDepartment } from "@/lib/courseMeta";
import { prisma } from "@/lib/prisma";
import { isWaitingTeacherName, WAITING_TEACHER_NAME } from "@/lib/teacherAssignment";

const DEPARTMENT = "安親班";
const CONFIRM_REPAIR = "repair-all-after-school-waiting-teachers";

function skipReasons(item: {
  courseHasFormalTeacher: boolean;
  unreported: boolean;
  unlocked: boolean;
  notCancelled: boolean;
  hasNoSubstitute: boolean;
}) {
  return [
    ...(!item.courseHasFormalTeacher ? ["Course老師仍為待排老師"] : []),
    ...(!item.unreported ? ["已回報"] : []),
    ...(!item.unlocked ? ["已鎖薪"] : []),
    ...(!item.notCancelled ? ["已取消"] : []),
    ...(!item.hasNoSubstitute ? ["已有代課紀錄"] : []),
  ];
}

async function scanWaitingTeacherAttendances() {
  const rows = await prisma.attendance.findMany({
    where: {
      actualTeacher: { name: { contains: WAITING_TEACHER_NAME } },
    },
    select: {
      id: true,
      date: true,
      actualTeacherId: true,
      actualTeacher: { select: { name: true } },
      isPayrollLocked: true,
      reportContent: true,
      reportSentAt: true,
      cancelled: true,
      substitutes: { select: { id: true, role: true } },
      course: {
        select: {
          code: true,
          school: true,
          courseType: true,
          department: true,
          teacherId: true,
          teacher: { select: { name: true } },
        },
      },
    },
    orderBy: [{ courseId: "asc" }, { date: "asc" }],
  });

  const items = rows.filter((row) => normalizeDepartment(row.course.department) === DEPARTMENT).map((row) => {
    const conditions = {
      courseHasFormalTeacher: !isWaitingTeacherName(row.course.teacher.name),
      actualTeacherIsWaiting: isWaitingTeacherName(row.actualTeacher.name),
      unreported: row.reportContent.trim() === "" && row.reportSentAt == null,
      unlocked: !row.isPayrollLocked,
      notCancelled: !row.cancelled,
      hasNoSubstitute: row.substitutes.length === 0,
    };
    const reasons = skipReasons(conditions);
    return {
      attendanceId: row.id,
      courseCode: row.course.code,
      school: row.course.school,
      course: row.course.courseType,
      date: row.date.toISOString().slice(0, 10),
      currentAttendanceTeacherId: row.actualTeacherId,
      currentAttendanceTeacher: row.actualTeacher.name,
      expectedTeacherId: row.course.teacherId,
      expectedTeacher: row.course.teacher.name,
      courseDepartment: row.course.department,
      conditions,
      eligible: conditions.actualTeacherIsWaiting && reasons.length === 0,
      skipReasons: reasons,
    };
  });
  const eligibleItems = items.filter((item) => item.eligible);
  const skippedItems = items.filter((item) => !item.eligible);
  const skippedReasonCounts = skippedItems
    .flatMap((item) => item.skipReasons)
    .reduce<Record<string, number>>((counts, reason) => {
      counts[reason] = (counts[reason] ?? 0) + 1;
      return counts;
    }, {});
  const affectedCourses = [...new Set(eligibleItems.map((item) => item.courseCode))].sort();

  return {
    items,
    eligibleItems,
    skippedItems,
    summary: {
      department: DEPARTMENT,
      waitingAttendances: items.length,
      eligible: eligibleItems.length,
      skipped: skippedItems.length,
      skippedReasonCounts,
      affectedCourseCount: affectedCourses.length,
      affectedCourses,
    },
  };
}

export async function GET(req: NextRequest) {
  try {
    const scan = await scanWaitingTeacherAttendances();
    if (req.nextUrl.searchParams.get("summaryOnly") === "1") {
      return NextResponse.json({ dryRun: true, summary: scan.summary });
    }
    return NextResponse.json({
      dryRun: true,
      note: "此報表掃描全部安親班待排老師 Attendance，不會修改資料。",
      summary: scan.summary,
      repairReport: scan.eligibleItems,
      skippedReport: scan.skippedItems,
    });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (body.confirm !== CONFIRM_REPAIR) {
      return NextResponse.json({ error: "缺少正式修復確認字串" }, { status: 400 });
    }

    const before = await scanWaitingTeacherAttendances();
    const operations = before.eligibleItems.map((item) => prisma.attendance.updateMany({
      where: {
        id: item.attendanceId,
        actualTeacherId: item.currentAttendanceTeacherId,
        cancelled: false,
        isPayrollLocked: false,
        reportContent: "",
        reportSentAt: null,
        substitutes: { none: {} },
        course: {
          department: item.courseDepartment,
          teacherId: item.expectedTeacherId,
        },
      },
      data: { actualTeacherId: item.expectedTeacherId },
    }));
    const results: Awaited<(typeof operations)[number]>[] = [];
    for (let index = 0; index < operations.length; index += 20) {
      results.push(...await Promise.all(operations.slice(index, index + 20)));
    }
    const updated = results.reduce((sum, result) => sum + result.count, 0);
    const raceConditionSkipped = before.eligibleItems.length - updated;
    const after = await scanWaitingTeacherAttendances();

    const response = {
      repaired: true,
      note: "只更新執行當下仍符合全部安全條件的安親班 Attendance。",
      result: {
        beforeWaitingCount: before.summary.waitingAttendances,
        beforeEligibleCount: before.summary.eligible,
        updated,
        skipped: before.summary.skipped + raceConditionSkipped,
        skippedReasonCounts: {
          ...before.summary.skippedReasonCounts,
          ...(raceConditionSkipped > 0 ? { "執行時安全條件已改變": raceConditionSkipped } : {}),
        },
        afterWaitingCount: after.summary.waitingAttendances,
        afterEligibleCount: after.summary.eligible,
        affectedCourses: before.summary.affectedCourses,
      },
    };
    if (req.nextUrl.searchParams.get("summaryOnly") === "1") {
      return NextResponse.json(response);
    }
    return NextResponse.json({
      ...response,
      updatedReport: before.eligibleItems.filter((_, index) => results[index]?.count === 1),
      remainingReport: after.items,
    });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
