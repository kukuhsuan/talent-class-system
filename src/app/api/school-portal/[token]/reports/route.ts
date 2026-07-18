import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { courseLabel } from "@/lib/courseMeta";
import { resolveSchoolPortalParam } from "@/lib/schoolPortalAccess";

export const dynamic = "force-dynamic";

// 安親班成果分頁 API：只回當月成果，支援課程篩選＋分頁（每批 10 筆）
function countOf(row: { studentCount: number | null; studentCountA?: number | null; studentCountB?: number | null }) {
  if (row.studentCountA != null || row.studentCountB != null) return (row.studentCountA ?? 0) + (row.studentCountB ?? 0);
  return row.studentCount ?? 0;
}

function parseStoredPhotos(value: string | null | undefined): string[] {
  const raw = String(value ?? "").trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map((item) => String(item).trim()).filter(Boolean);
  } catch { /* 舊資料為單一網址 */ }
  return [raw];
}

function toPortalUrl(stored: string, token: string) {
  if (!stored.startsWith("private:")) return stored;
  return `/api/school-portal/${encodeURIComponent(token)}/photo?path=${encodeURIComponent(stored.slice("private:".length))}`;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const { schoolId } = await resolveSchoolPortalParam(token);
    const { searchParams } = new URL(req.url);
    const now = new Date();
    const year = Math.min(2035, Math.max(2020, Number(searchParams.get("year") ?? now.getFullYear()) || now.getFullYear()));
    const month = Math.min(12, Math.max(1, Number(searchParams.get("month") ?? now.getMonth() + 1) || now.getMonth() + 1));
    const offset = Math.max(0, Number(searchParams.get("offset") ?? 0) || 0);
    const limit = Math.min(20, Math.max(1, Number(searchParams.get("limit") ?? 10) || 10));
    const courseFilter = String(searchParams.get("course") ?? "").trim();

    const school = await prisma.school.findUnique({ where: { id: schoolId }, select: { name: true } });
    if (!school) return NextResponse.json({ error: "找不到園所" }, { status: 404 });

    const records = await prisma.attendance.findMany({
      where: {
        date: { gte: new Date(year, month - 1, 1), lt: new Date(year, month, 1) },
        OR: [
          { scheduledSchoolId: schoolId },
          { scheduledSchoolId: null, course: { OR: [{ schoolId }, { school: school.name }] } },
        ],
      },
      select: {
        id: true, date: true, cancelled: true, reportContent: true, skillFocus: true, classStatus: true,
        incident: true, incidentNotified: true, aiSummary: true, aiSkillFocus: true, aiTeachingNote: true,
        reportPhotos: true, studentCount: true, studentCountA: true, studentCountB: true,
        scheduledTime: true, scheduledSchoolName: true,
        actualTeacher: { select: { name: true } },
        course: { select: { school: true, courseType: true, time: true } },
      },
      orderBy: { date: "desc" },
    });

    const lessons = records.filter((r) => !r.cancelled);
    const withReport = lessons.filter((r) =>
      r.reportContent.trim() || r.aiSummary.trim() || r.aiTeachingNote.trim() || r.skillFocus.trim());

    const courseOptions = [...new Set(lessons.map((r) => courseLabel(r.course.courseType)))].sort();
    const filtered = courseFilter
      ? withReport.filter((r) => courseLabel(r.course.courseType) === courseFilter)
      : withReport;

    const page = filtered.slice(offset, offset + limit).map((r) => {
      const photos = parseStoredPhotos(r.reportPhotos).map((stored) => toPortalUrl(stored, token));
      return {
        id: r.id,
        date: r.date.toISOString().slice(0, 10),
        courseName: courseLabel(r.course.courseType),
        teacherName: r.actualTeacher.name,
        time: r.scheduledTime?.trim() || r.course.time,
        studentCount: countOf(r),
        reportContent: r.reportContent,
        skillFocus: r.skillFocus,
        classStatus: r.classStatus,
        incident: r.incident,
        incidentNote: r.incident
          ? (r.incidentNotified === "是" ? "本堂課有特殊狀況，已通知園所窗口。" : "本堂課有特殊狀況，詳情請洽行政窗口。")
          : "",
        aiSummary: r.aiSummary,
        aiTeachingNote: r.aiTeachingNote,
        photoUrls: photos,
      };
    });

    return NextResponse.json({
      year, month,
      total: filtered.length,
      lessonCount: lessons.length,
      reportedCount: withReport.length,
      courseOptions,
      items: page,
      hasMore: offset + limit < filtered.length,
    }, { headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" } });
  } catch {
    return NextResponse.json({ error: "園所連結無效或已過期" }, { status: 401 });
  }
}
