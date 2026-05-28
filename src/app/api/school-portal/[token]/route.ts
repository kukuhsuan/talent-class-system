import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { courseLabel, normalizeDepartment } from "@/lib/courseMeta";
import { verifySchoolPortalToken } from "@/lib/schoolPortalToken";

function countOf(row: { studentCount: number | null; studentCountA?: number | null; studentCountB?: number | null }) {
  if (row.studentCountA != null || row.studentCountB != null) return (row.studentCountA ?? 0) + (row.studentCountB ?? 0);
  return row.studentCount ?? 0;
}

function dateText(date: Date) {
  return date.toISOString().slice(0, 10);
}

function firstPhotoUrl(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return String(parsed[0] ?? "").trim();
  } catch {
    // Existing rows may contain a plain URL.
  }
  return raw;
}

function portalPhotoUrl(value: string | null | undefined, token: string) {
  const first = firstPhotoUrl(value);
  if (!first.startsWith("private:")) return first;
  const path = first.slice("private:".length);
  return `/api/school-portal/${encodeURIComponent(token)}/photo?path=${encodeURIComponent(path)}`;
}

async function getSkillCards() {
  try {
    return await prisma.skillCard.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
    }) as unknown as Array<{ name: string; icon: string; imageUrl: string; description: string }>;
  } catch {
    return [];
  }
}

async function ensurePortalTokenVersionColumn() {
  try {
    await prisma.$executeRawUnsafe('ALTER TABLE School ADD COLUMN portalTokenVersion INTEGER NOT NULL DEFAULT 1');
  } catch {
    // Column already exists.
  }
}

async function requireCurrentPortalToken(token: string) {
  const verified = await verifySchoolPortalToken(token);
  await ensurePortalTokenVersionColumn();
  const rows = await prisma.$queryRawUnsafe<Array<{ portalTokenVersion: number }>>(
    "SELECT portalTokenVersion FROM School WHERE id = ?",
    verified.schoolId,
  );
  if (Number(rows[0]?.portalTokenVersion ?? 0) !== verified.tokenVersion) {
    throw new Error("Invalid school portal token");
  }
  return verified;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const { schoolId } = await requireCurrentPortalToken(decodeURIComponent(token));
    const { searchParams } = new URL(req.url);
    const year = Number(searchParams.get("year") ?? new Date().getFullYear());
    const month = Number(searchParams.get("month") ?? new Date().getMonth() + 1);
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 1);

    const [school, skillCards] = await Promise.all([
      prisma.school.findUnique({ where: { id: schoolId } }),
      getSkillCards(),
    ]);
    if (!school) return NextResponse.json({ error: "找不到園所" }, { status: 404 });

    const records = await prisma.attendance.findMany({
      where: {
        date: { gte: start, lt: end },
        course: { OR: [{ schoolId }, { school: school.name }] },
      } as never,
      include: {
        course: true,
        actualTeacher: true,
        assessments: true,
      },
      orderBy: { date: "desc" },
    }) as unknown as Array<{
      id: number;
      date: Date;
      studentCount: number | null;
      studentCountA: number | null;
      studentCountB: number | null;
      cancelled: boolean;
      reportContent: string;
      skillFocus: string;
      classStatus: string;
      incident: boolean;
      incidentChild: string;
      incidentProcess: string;
      incidentAction: string;
      incidentNotified: string;
      aiSummary: string;
      aiSkillFocus: string;
      aiTeachingNote: string;
      reportPhotos: string;
      schoolNotifyStatus: string;
      actualTeacher: { name: string };
      course: { id: number; school: string; courseType: string; department: string; category: string; time: string };
      assessments: Array<{ id: number; childName: string; courseName: string; scores: string; comment: string; title: string; createdAt: Date }>;
    }>;

    const visibleReports = records.filter((r) =>
      r.reportContent || r.aiSummary || r.aiTeachingNote || r.skillFocus || r.classStatus || r.incident
    );

    const reports = visibleReports.map((r) => ({
      id: r.id,
      date: dateText(r.date),
      school: r.course.school,
      courseType: r.course.courseType,
      courseName: courseLabel(r.course.courseType),
      department: normalizeDepartment(r.course.department),
      category: r.course.category,
      time: r.course.time,
      teacherName: r.actualTeacher.name,
      studentCount: countOf(r),
      reportContent: r.reportContent,
      skillFocus: r.skillFocus,
      classStatus: r.classStatus,
      incident: r.incident,
      incidentChild: r.incidentChild,
      incidentProcess: r.incidentProcess,
      incidentAction: r.incidentAction,
      incidentNotified: r.incidentNotified,
      aiSummary: r.aiSummary,
      aiSkillFocus: r.aiSkillFocus,
      aiTeachingNote: r.aiTeachingNote,
      representativePhotoUrl: portalPhotoUrl(r.reportPhotos, token),
      schoolNotifyStatus: r.schoolNotifyStatus,
    }));

    const monthlyRows = records.filter((r) => !r.cancelled).map((r) => ({
      id: r.id,
      date: dateText(r.date),
      courseName: courseLabel(r.course.courseType),
      teacherName: r.actualTeacher.name,
      time: r.course.time,
      studentCount: countOf(r),
      reportContent: r.reportContent,
    }));

    const assessments = records.flatMap((r) => r.assessments.map((a) => ({
      id: a.id,
      attendanceId: r.id,
      childName: a.childName,
      courseName: a.courseName || courseLabel(r.course.courseType),
      teacherName: r.actualTeacher.name,
      date: dateText(r.date),
      title: a.title,
      comment: a.comment,
      certificateUrl: `/school-portal/${encodeURIComponent(token)}/certificate/${a.id}`,
    })));

    const courseTypes = Array.from(new Set(records.map((r) => courseLabel(r.course.courseType)).filter(Boolean)));
    const progressRows = courseTypes.length > 0
      ? await prisma.courseProgress.findMany({
          where: { courseType: { in: courseTypes } },
          orderBy: [{ courseType: "asc" }, { lesson: "asc" }],
        })
      : [];
    const curriculum = courseTypes.map((courseType) => ({
      courseType,
      courseName: courseLabel(courseType),
      items: progressRows
        .filter((row) => row.courseType === courseType)
        .map((row) => ({ lesson: row.lesson, title: row.title })),
    })).filter((row) => row.items.length > 0);

    const totalPeople = monthlyRows.reduce((sum, row) => sum + row.studentCount, 0);

    return NextResponse.json({
      school: {
        id: school.id,
        name: school.name,
        type: school.type ? normalizeDepartment(school.type) : "未分類",
        region: school.region,
        address: school.address,
        contact: school.contact,
        phone: school.phone,
      },
      year,
      month,
      summary: {
        reports: reports.length,
        lessons: monthlyRows.length,
        totalPeople,
        assessments: assessments.length,
      },
      reports,
      monthlyRows,
      curriculum,
      assessments,
      skillCards,
    });
  } catch {
    return NextResponse.json({ error: "園所連結無效或已過期" }, { status: 401 });
  }
}
