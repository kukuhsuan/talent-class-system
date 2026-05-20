import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { courseLabel } from "@/lib/courseMeta";
import { generateTeachingReport, safeJsonArray } from "@/lib/teachingReport";
import { COURSE_CURRICULUM } from "@/lib/line";

type ReportPayload = {
  studentCount?: number | null;
  progress?: string;
  skillFocus?: string[];
  classStatus?: string;
  incident?: boolean;
  incidentChild?: string;
  incidentProcess?: string;
  incidentAction?: string;
  incidentNotified?: string;
  photos?: string[];
};

function progressText(item: { lesson: number; title: string }) {
  return `第${item.lesson}堂 ${item.title}`;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const attendance = await prisma.attendance.findUnique({
      where: { id: Number(id) },
      include: { course: true, actualTeacher: true },
    });

    if (!attendance) {
      return NextResponse.json({ error: "找不到課程回報資料，可能這筆出勤已刪除或連結已失效" }, { status: 404 });
    }
    const normalizedCourseType = courseLabel(attendance.course.courseType);
    let progressRows = await prisma.courseProgress.findMany({
      where: { courseType: normalizedCourseType },
      orderBy: { lesson: "asc" },
    });
    if (progressRows.length === 0 && COURSE_CURRICULUM[normalizedCourseType]) {
      progressRows = COURSE_CURRICULUM[normalizedCourseType].map((item) => ({
        id: 0,
        courseType: normalizedCourseType,
        lesson: item.lesson,
        title: item.title,
        createdAt: new Date(),
      }));
    }

    return NextResponse.json({
      id: attendance.id,
      date: attendance.date.toISOString().slice(0, 10),
      school: attendance.course.school,
      courseType: attendance.course.courseType,
      courseName: normalizedCourseType,
      className: attendance.course.enrollCount,
      teacherName: attendance.actualTeacher.name,
      studentCount: attendance.studentCount,
      reportContent: attendance.reportContent,
      progressOptions: progressRows.slice(0, 30).map((item) => ({
        id: item.id,
        lesson: item.lesson,
        title: item.title,
        value: progressText(item),
      })),
      skillFocus: safeJsonArray(attendance.skillFocus),
      classStatus: attendance.classStatus,
      incident: attendance.incident,
      incidentChild: attendance.incidentChild,
      incidentProcess: attendance.incidentProcess,
      incidentAction: attendance.incidentAction,
      incidentNotified: attendance.incidentNotified,
      photos: safeJsonArray(attendance.reportPhotos),
      aiSummary: attendance.aiSummary,
      aiSkillFocus: attendance.aiSkillFocus,
      aiTeachingNote: attendance.aiTeachingNote,
    });
  } catch (e) {
    console.error("report form load failed", e);
    return NextResponse.json({ error: `讀取回報表單失敗：${(e as Error).message}` }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const attendance = await prisma.attendance.findUnique({
      where: { id: Number(id) },
      include: { course: true },
    });

    if (!attendance) {
      return NextResponse.json({ error: "找不到課程回報資料，可能這筆出勤已刪除或連結已失效" }, { status: 404 });
    }

    const data = (await req.json()) as ReportPayload;
    const skillFocus = safeJsonArray(data.skillFocus);
    const photos = safeJsonArray(data.photos).slice(0, 5);
    const progress = String(data.progress ?? "").trim();
    const classStatus = String(data.classStatus ?? "普通").trim();
    const incident = Boolean(data.incident);

    const generated = generateTeachingReport({
      school: attendance.course.school,
      courseType: attendance.course.courseType,
      progress,
      skillFocus,
      classStatus,
      incident,
      incidentChild: String(data.incidentChild ?? "").trim(),
      incidentProcess: String(data.incidentProcess ?? "").trim(),
      incidentAction: String(data.incidentAction ?? "").trim(),
      incidentNotified: String(data.incidentNotified ?? "").trim(),
    });

    const reportContent = [
      progress ? `課程進度：${progress}` : "",
      generated.aiSummary,
      generated.aiSkillFocus,
      generated.aiTeachingNote,
    ].filter(Boolean).join("\n");

    await prisma.attendance.update({
      where: { id: attendance.id },
      data: {
        studentCount: data.studentCount == null ? attendance.studentCount : Number(data.studentCount),
        reportContent,
        reportSentAt: new Date(),
        skillFocus: JSON.stringify(skillFocus),
        classStatus,
        incident,
        incidentChild: incident ? String(data.incidentChild ?? "").trim() : "",
        incidentProcess: incident ? String(data.incidentProcess ?? "").trim() : "",
        incidentAction: incident ? String(data.incidentAction ?? "").trim() : "",
        incidentNotified: incident ? String(data.incidentNotified ?? "").trim() : "",
        reportPhotos: JSON.stringify(photos),
        ...generated,
      },
    });

    return NextResponse.json({ ok: true, ...generated });
  } catch (e) {
    console.error("report form save failed", e);
    return NextResponse.json({ error: `送出回報失敗：${(e as Error).message}` }, { status: 500 });
  }
}
