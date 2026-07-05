import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizeCategory } from "@/lib/courseMeta";

export async function GET(req: NextRequest) {
  const codes = [...new Set(
    (req.nextUrl.searchParams.get("codes") ?? "")
      .split(",")
      .map((code) => code.trim())
      .filter(Boolean),
  )];
  const limit = Math.min(1000, Math.max(20, Number(req.nextUrl.searchParams.get("limit") ?? 500)));

  const rows = await prisma.attendance.findMany({
    where: codes.length > 0 ? { course: { code: { in: codes } } } : undefined,
    select: {
      id: true,
      date: true,
      category: true,
      cancelled: true,
      reportContent: true,
      reportSentAt: true,
      studentCount: true,
      studentCountA: true,
      studentCountB: true,
      isPayrollLocked: true,
      actualTeacher: { select: { name: true } },
      course: { select: { code: true, school: true, category: true } },
    },
    orderBy: [{ courseId: "asc" }, { date: "asc" }],
  });

  const mismatches = rows
    .filter((row) => normalizeCategory(row.category) !== normalizeCategory(row.course.category))
    .map((row) => {
      const unreported = !row.reportContent.trim()
        && row.reportSentAt == null
        && row.studentCount == null
        && row.studentCountA == null
        && row.studentCountB == null;
      return {
        attendanceId: row.id,
        courseCode: row.course.code,
        school: row.course.school,
        teacher: row.actualTeacher.name,
        date: row.date.toISOString().slice(0, 10),
        courseCategory: normalizeCategory(row.course.category),
        attendanceCategory: normalizeCategory(row.category),
        isPayrollLocked: row.isPayrollLocked,
        isReported: !unreported,
        cancelled: row.cancelled,
      };
    });

  return NextResponse.json({
    dryRun: true,
    codes: codes.length > 0 ? codes : "all",
    note: "此報表只列出 Course.category 與 Attendance.category 差異，不會修改資料。",
    summary: {
      scanned: rows.length,
      mismatched: mismatches.length,
      locked: mismatches.filter((row) => row.isPayrollLocked).length,
      reported: mismatches.filter((row) => row.isReported).length,
    },
    items: mismatches.slice(0, limit),
  });
}
