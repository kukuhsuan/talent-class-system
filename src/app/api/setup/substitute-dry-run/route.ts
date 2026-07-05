import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseAttendanceDay } from "@/lib/attendanceBatch";

export async function GET() {
  const legacyRecords = await prisma.substitute.findMany({
    where: { attendanceId: null },
    include: { originalTeacher: true, substituteTeacher: true },
    orderBy: { date: "asc" },
  });

  const items = await Promise.all(legacyRecords.map(async (record) => {
    const date = record.date.toISOString().slice(0, 10);
    const start = parseAttendanceDay(date);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    const candidates = await prisma.attendance.findMany({
      where: {
        date: { gte: start, lt: end },
        cancelled: false,
        course: {
          school: record.school,
          courseType: record.courseType,
          teacherId: record.originalTeacherId,
        },
      },
      select: {
        id: true,
        date: true,
        isPayrollLocked: true,
        actualTeacherId: true,
        actualTeacher: { select: { name: true } },
        course: { select: { code: true, time: true } },
      },
      orderBy: [{ course: { time: "asc" } }, { id: "asc" }],
    });
    const status = candidates.length === 0 ? "unresolved" : candidates.length === 1 ? "unique" : "ambiguous";
    return {
      substituteId: record.id,
      date,
      school: record.school,
      courseType: record.courseType,
      originalTeacher: record.originalTeacher.name,
      substituteTeacher: record.substituteTeacher?.name ?? "",
      status,
      candidates: candidates.map((candidate) => ({
        attendanceId: candidate.id,
        courseCode: candidate.course.code,
        time: candidate.course.time,
        currentActualTeacher: candidate.actualTeacher.name,
        alreadyMatchesSubstitute: candidate.actualTeacherId === record.substituteTeacherId,
        isPayrollLocked: candidate.isPayrollLocked,
      })),
    };
  }));

  return NextResponse.json({
    dryRun: true,
    note: "此報表只分析舊代課紀錄，不會修改 Attendance 或薪資資料。",
    summary: {
      legacyRecords: items.length,
      unique: items.filter((item) => item.status === "unique").length,
      ambiguous: items.filter((item) => item.status === "ambiguous").length,
      unresolved: items.filter((item) => item.status === "unresolved").length,
      uniquelyMatchedButLocked: items.filter((item) => item.status === "unique" && item.candidates[0]?.isPayrollLocked).length,
    },
    items,
  });
}
