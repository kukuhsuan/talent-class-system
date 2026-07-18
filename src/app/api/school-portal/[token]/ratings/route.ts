import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { courseLabel } from "@/lib/courseMeta";
import { resolveSchoolPortalParam } from "@/lib/schoolPortalAccess";
import { normalizeRatingRow, openEligibleRatings, type CourseRatingRow } from "@/lib/courseRating";

export const dynamic = "force-dynamic";

// 安親班評分分頁 API：
// 1. 自動補建符合條件的待評分任務（課已結束＋已回報＋未取消；attendanceId UNIQUE 防重複）
// 2. 只回待評分（open）與已完成（submitted/closed）；未建立任務（未來課/未回報）不顯示
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const { schoolId } = await resolveSchoolPortalParam(token);
    const school = await prisma.school.findUnique({ where: { id: schoolId }, select: { name: true, type: true } });
    if (!school) return NextResponse.json({ error: "找不到園所" }, { status: 404 });
    if (!String(school.type ?? "").includes("安親")) {
      // 幼兒園不提供評分功能，也不建立評分任務
      return NextResponse.json({ pending: [], completed: [] }, { headers: { "X-Robots-Tag": "noindex, nofollow" } });
    }

    // 近 90 天課堂（評分以近期課程為主，避免整包撈取）
    const since = new Date(Date.now() - 90 * 24 * 3600 * 1000);
    const records = await prisma.attendance.findMany({
      where: {
        date: { gte: since },
        cancelled: false,
        OR: [
          { scheduledSchoolId: schoolId },
          { scheduledSchoolId: null, course: { OR: [{ schoolId }, { school: school.name }] } },
        ],
      },
      select: {
        id: true, date: true, cancelled: true, reportContent: true,
        studentCount: true, studentCountA: true, studentCountB: true, scheduledTime: true,
        actualTeacher: { select: { name: true } },
        course: { select: { courseType: true, time: true, department: true } },
      },
      orderBy: { date: "desc" },
    });
    const afterSchoolRecords = records.filter((r) => String(r.course.department ?? "").includes("安親"));

    // 自動開放：補建符合條件的評分任務
    await openEligibleRatings(afterSchoolRecords.map((r) => ({
      id: r.id,
      date: r.date,
      cancelled: r.cancelled,
      reportContent: r.reportContent,
      studentCount: r.studentCount,
      studentCountA: r.studentCountA,
      studentCountB: r.studentCountB,
      scheduledTime: r.scheduledTime,
      courseTime: r.course.time,
    })));

    const ids = afterSchoolRecords.map((r) => r.id);
    const rows = ids.length
      ? await prisma.$queryRawUnsafe<CourseRatingRow[]>(
          `SELECT * FROM CourseRating WHERE attendanceId IN (${ids.map(() => "?").join(",")})`,
          ...ids,
        )
      : [];
    const byId = new Map(afterSchoolRecords.map((r) => [r.id, r]));
    const normalized = rows.map(normalizeRatingRow).filter((row) => byId.has(row.attendanceId));

    const item = (row: CourseRatingRow) => {
      const record = byId.get(row.attendanceId)!;
      return {
        attendanceId: row.attendanceId,
        date: record.date.toISOString().slice(0, 10),
        courseName: courseLabel(record.course.courseType),
        teacherName: record.actualTeacher.name,
        status: row.status,
        ratingUrl: row.status === "open" ? `/rating/${encodeURIComponent(row.token)}` : "",
      };
    };

    const pending = normalized.filter((r) => r.status === "open").map(item).sort((a, b) => a.date.localeCompare(b.date));
    const completed = normalized.filter((r) => r.status === "submitted").map((row) => {
      const record = byId.get(row.attendanceId)!;
      return {
        attendanceId: row.attendanceId,
        date: record.date.toISOString().slice(0, 10),
        courseName: courseLabel(record.course.courseType),
        teacherName: record.actualTeacher.name,
        scoreOverall: row.scoreOverall,
        submittedAt: row.submittedAt,
      };
    }).sort((a, b) => b.date.localeCompare(a.date));

    return NextResponse.json({ pending, completed }, {
      headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" },
    });
  } catch {
    return NextResponse.json({ error: "園所連結無效或已過期" }, { status: 401 });
  }
}
