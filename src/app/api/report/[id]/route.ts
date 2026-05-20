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
};

function progressText(item: { lesson: number; title: string }) {
  return `第${item.lesson}堂 ${item.title}`;
}

function isKindergarten(department: string | null | undefined) {
  return (department ?? "").includes("幼兒園");
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
      department: attendance.course.department,
      reportMode: isKindergarten(attendance.course.department) ? "kindergarten" : "simple",
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
    const progress = String(data.progress ?? "").trim();
    const kindergarten = isKindergarten(attendance.course.department);
    const classStatus = kindergarten ? String(data.classStatus ?? "普通").trim() : "";
    const incident = Boolean(data.incident);

    const incidentChild = String(data.incidentChild ?? "").trim();
    const incidentProcess = String(data.incidentProcess ?? "").trim();
    const incidentAction = String(data.incidentAction ?? "").trim();
    const incidentNotified = String(data.incidentNotified ?? "").trim();
    const generated = kindergarten
      ? generateTeachingReport({
        school: attendance.course.school,
        courseType: attendance.course.courseType,
        progress,
        skillFocus,
        classStatus,
        incident,
        incidentChild,
        incidentProcess,
        incidentAction,
        incidentNotified,
      })
      : {
        aiSummary: `今日訓練內容：${progress || "老師已完成現場訓練回報"}。`,
        aiSkillFocus: "",
        aiTeachingNote: incident
          ? `本次課程有特殊事件，${incidentChild ? `孩子「${incidentChild}」` : "現場"}狀況為：${incidentProcess || "已由老師現場觀察與處理"}。處理方式：${incidentAction || "已即時處理"}。${incidentNotified === "是" ? "已通知現場老師或窗口。" : "尚未通知現場老師或窗口。"}`
          : "本次課程無特殊事件。",
      };

    const reportContent = [
      progress ? `${kindergarten ? "課程進度" : "訓練內容"}：${progress}` : "",
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
        skillFocus: JSON.stringify(kindergarten ? skillFocus : []),
        classStatus,
        incident,
        incidentChild: incident ? incidentChild : "",
        incidentProcess: incident ? incidentProcess : "",
        incidentAction: incident ? incidentAction : "",
        incidentNotified: incident ? incidentNotified : "",
        ...generated,
      },
    });

    return NextResponse.json({ ok: true, ...generated });
  } catch (e) {
    console.error("report form save failed", e);
    return NextResponse.json({ error: `送出回報失敗：${(e as Error).message}` }, { status: 500 });
  }
}
