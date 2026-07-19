import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizeDepartment } from "@/lib/courseMeta";
import { resolveSchoolPortalParam } from "@/lib/schoolPortalAccess";
import { ensureCourseRatingTables } from "@/lib/courseRating";
import { COURSE_CHANGE_STATUS } from "@/lib/courseChangeRequests";
import { hasValidPortalSession } from "@/lib/portalAuth";

export const dynamic = "force-dynamic";

// 輕量摘要 API：園所名稱/類型＋待辦數（安親班端首次載入用，避免一次抓整包資料）
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const { schoolId } = await resolveSchoolPortalParam(token, req);
    const school = await prisma.school.findUnique({
      where: { id: schoolId },
      select: { id: true, name: true, type: true },
    });
    if (!school) return NextResponse.json({ error: "找不到園所" }, { status: 404 });

    const isAfterSchool = String(school.type ?? "").includes("安親");
    // 評分待辦：幼兒園＋安親班共用；異動申請目前僅安親班使用
    await ensureCourseRatingTables();
    const [ratingRows, changeCount] = await Promise.all([
      prisma.$queryRawUnsafe<Array<{ n: number | bigint }>>(
        `SELECT COUNT(*) AS n FROM CourseRating cr
         JOIN Attendance a ON a.id = cr.attendanceId
         JOIN Course c ON c.id = a.courseId
         WHERE cr.status = 'open' AND (a.scheduledSchoolId = ? OR (a.scheduledSchoolId IS NULL AND c.schoolId = ?))`,
        schoolId, schoolId,
      ),
      isAfterSchool
        ? prisma.courseChangeRequest.count({
            where: {
              OR: [{ requestedBySchoolId: schoolId }, { originalSchoolId: schoolId }],
              status: { notIn: [COURSE_CHANGE_STATUS.completed, COURSE_CHANGE_STATUS.cancelled, COURSE_CHANGE_STATUS.teacherUnavailable] },
            },
          })
        : Promise.resolve(0),
    ]);
    const pendingRatings = Number(ratingRows[0]?.n ?? 0);
    const processingChanges = changeCount;

    const verified = await hasValidPortalSession(req, schoolId);
    return NextResponse.json({
      school: { id: school.id, name: school.name, type: school.type ? normalizeDepartment(school.type) : "未分類" },
      isAfterSchool,
      pendingRatings,
      processingChanges,
      verified,
    }, { headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" } });
  } catch {
    return NextResponse.json({ error: "園所連結無效或已過期" }, { status: 401 });
  }
}
