import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { BACKOFFICE_ROLES, requireRole } from "@/lib/permissions";
import {
  CourseRatingRow,
  ensureCourseRatingTables,
  getOrCreateRating,
  isAfterSchool,
  normalizeRatingRow,
} from "@/lib/courseRating";

// 後台：建立（或取得）某堂課的評分連結
export async function POST(req: NextRequest) {
  const auth = await requireRole(BACKOFFICE_ROLES);
  if (auth.response) return auth.response;
  const data = await req.json().catch(() => ({}));
  const attendanceId = Number(data.attendanceId);
  if (!Number.isFinite(attendanceId)) return NextResponse.json({ error: "請指定課堂" }, { status: 400 });
  const attendance = await prisma.attendance.findUnique({
    where: { id: attendanceId },
    include: { course: { select: { department: true } } },
  });
  if (!attendance) return NextResponse.json({ error: "找不到這堂課" }, { status: 404 });
  if (!isAfterSchool(attendance.course.department)) {
    return NextResponse.json({ error: "評分連結僅提供安親班課程" }, { status: 400 });
  }
  const rating = await getOrCreateRating(attendanceId);
  return NextResponse.json({ token: rating.token, status: rating.status, path: `/rating/${rating.token}` });
}

// 後台：評分列表（篩選：安親班／老師／課程／年月／整體分數）
export async function GET(req: NextRequest) {
  const auth = await requireRole(BACKOFFICE_ROLES);
  if (auth.response) return auth.response;
  await ensureCourseRatingTables();
  const { searchParams } = new URL(req.url);
  const school = searchParams.get("school") ?? "";
  const teacherId = Number(searchParams.get("teacherId") ?? "") || 0;
  const courseId = Number(searchParams.get("courseId") ?? "") || 0;
  const year = Number(searchParams.get("year") ?? "") || 0;
  const month = Number(searchParams.get("month") ?? "") || 0;
  const maxOverall = Number(searchParams.get("maxOverall") ?? "") || 0; // 例如 2 = 只看 1–2 分
  const status = searchParams.get("status") ?? "";

  const rows = await prisma.$queryRawUnsafe<CourseRatingRow[]>(
    `SELECT * FROM CourseRating ${status ? "WHERE status = ?" : ""} ORDER BY id DESC`,
    ...(status ? [status] : []),
  );
  const ratings = rows.map(normalizeRatingRow)
    .filter((r) => !maxOverall || (r.status === "submitted" && r.scoreOverall <= maxOverall));
  if (!ratings.length) return NextResponse.json([]);

  const where: Record<string, unknown> = { id: { in: ratings.map((r) => r.attendanceId) } };
  const courseFilter: Record<string, unknown> = {};
  if (school) courseFilter.school = school;
  if (courseId) where.courseId = courseId;
  if (teacherId) where.actualTeacherId = teacherId;
  if (Object.keys(courseFilter).length) where.course = courseFilter;
  if (year && month) {
    where.date = { gte: new Date(year, month - 1, 1), lt: new Date(year, month, 1) };
  }
  const attendances = await prisma.attendance.findMany({
    where,
    include: {
      course: { select: { school: true, courseType: true, code: true } },
      actualTeacher: { select: { id: true, name: true } },
    },
  });
  const byId = new Map(attendances.map((a) => [a.id, a]));
  const items = ratings.flatMap((rating) => {
    const attendance = byId.get(rating.attendanceId);
    if (!attendance) return [];
    return [{
      ...rating,
      date: attendance.date.toISOString().slice(0, 10),
      school: attendance.course.school,
      courseName: attendance.course.courseType,
      courseCode: attendance.course.code,
      teacherId: attendance.actualTeacher?.id ?? 0,
      teacherName: attendance.actualTeacher?.name ?? "",
    }];
  });
  items.sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
  return NextResponse.json(items);
}
