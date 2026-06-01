import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { courseLabel, requiresStudentCount } from "@/lib/courseMeta";
import { normalizeClassStatus, safeJsonArray } from "@/lib/teachingReport";
import { COURSE_CURRICULUM } from "@/lib/line";
import { notifySchoolReport } from "@/lib/schoolNotification";
import { getLessonTemplateForReport, listLessonTemplates } from "@/lib/lessonTemplates";
import { signPublicAccessToken, verifyPublicAccessToken } from "@/lib/publicAccessToken";

type ReportPayload = {
  studentCount?: number | null;
  progress?: string;
  skillFocus?: string[];
  classStatus?: string;
  outcomeText?: string;
  representativePhotoUrl?: string;
  reportPhotos?: string;
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

function firstPhotoUrl(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return String(parsed[0] ?? "").trim();
  } catch {
    // Older data can be a plain URL string.
  }
  return raw;
}

function reportPhotoUrl(value: string | null | undefined, token: string) {
  const first = firstPhotoUrl(value);
  if (!first.startsWith("private:")) return first;
  const path = first.slice("private:".length);
  return `/api/report/${encodeURIComponent(token)}/photo?path=${encodeURIComponent(path)}`;
}

function sanitizePhotoUrl(value: string) {
  const raw = value.trim();
  if (!raw || raw.startsWith("data:")) return "";
  try {
    const url = new URL(raw);
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : "";
  } catch {
    return "";
  }
}

async function isFinalKindergartenAttendance(attendance: { id: number; date: Date; courseId: number; course: { department: string } }) {
  if (!isKindergarten(attendance.course.department)) return false;
  const latest = await prisma.attendance.findFirst({
    where: { courseId: attendance.courseId },
    orderBy: { date: "desc" },
    select: { id: true, date: true },
  });
  if (!latest) return false;
  return latest.id === attendance.id || latest.date <= attendance.date;
}

async function assessmentCount(attendanceId: number) {
  try {
    const rows = await prisma.$queryRawUnsafe<{ count: number }[]>(
      "SELECT COUNT(*) as count FROM KindergartenAssessment WHERE attendanceId = ?",
      attendanceId,
    );
    return Number(rows[0]?.count ?? 0);
  } catch {
    return 0;
  }
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { attendanceId } = verifyPublicAccessToken(decodeURIComponent(id), "report");
    const attendance = await prisma.attendance.findUnique({
      where: { id: attendanceId },
      include: { course: true, actualTeacher: true },
    });

    if (!attendance) {
      return NextResponse.json({ error: "找不到課程回報資料，可能這筆出勤已刪除或連結已失效" }, { status: 404 });
    }
    const normalizedCourseType = courseLabel(attendance.course.courseType);
    let progressRows = isKindergarten(attendance.course.department)
      ? await listLessonTemplates(prisma, normalizedCourseType)
      : await prisma.courseProgress.findMany({
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
      })) as never;
    }

    return NextResponse.json({
      id: attendance.id,
      date: attendance.date.toISOString().slice(0, 10),
      school: attendance.course.school,
      courseType: attendance.course.courseType,
      department: attendance.course.department,
      category: attendance.category,
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
        focus: "focus" in item ? item.focus : "",
        skills: "skills" in item ? item.skills : [],
        outcomeText: "activityDirection" in item ? item.activityDirection : "",
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
      representativePhotoUrl: reportPhotoUrl(attendance.reportPhotos, id),
      shouldAskAssessment: await isFinalKindergartenAttendance(attendance),
      assessmentCount: await assessmentCount(attendance.id),
      schoolNotifyStatus: (attendance as unknown as { schoolNotifyStatus?: string }).schoolNotifyStatus ?? "未通知",
      schoolNotifyError: (attendance as unknown as { schoolNotifyError?: string }).schoolNotifyError ?? "",
    });
  } catch (e) {
    if ((e as Error).message.includes("token") || (e as Error).message.includes("Expired")) {
      return NextResponse.json({ error: "回報連結無效或已過期" }, { status: 401 });
    }
    console.error("report form load failed", e);
    return NextResponse.json({ error: `讀取回報表單失敗：${(e as Error).message}` }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { attendanceId } = verifyPublicAccessToken(decodeURIComponent(id), "report");
    const attendance = await prisma.attendance.findUnique({
      where: { id: attendanceId },
      include: { course: true },
    });

    if (!attendance) {
      return NextResponse.json({ error: "找不到課程回報資料，可能這筆出勤已刪除或連結已失效" }, { status: 404 });
    }

    const data = (await req.json()) as ReportPayload;
    const progress = String(data.progress ?? "").trim();
    const needsStudentCount = requiresStudentCount(attendance.category);
    if (needsStudentCount && data.studentCount == null) {
      return NextResponse.json({ error: "請填寫今日出席人數" }, { status: 400 });
    }
    const kindergarten = isKindergarten(attendance.course.department);
    const classStatus = kindergarten ? normalizeClassStatus(String(data.classStatus ?? "穩定學習").trim()) : "";
    const representativePhotoUrl = sanitizePhotoUrl(String(data.representativePhotoUrl ?? data.reportPhotos ?? "").trim());
    const incident = Boolean(data.incident);

    const incidentChild = String(data.incidentChild ?? "").trim();
    const incidentProcess = String(data.incidentProcess ?? "").trim();
    const incidentAction = String(data.incidentAction ?? "").trim();
    const incidentNotified = String(data.incidentNotified ?? "").trim();
    const lessonTemplate = kindergarten
      ? await getLessonTemplateForReport(prisma, attendance.course.courseType, progress)
      : null;
    const skillFocus = kindergarten
      ? safeJsonArray(data.skillFocus).length ? safeJsonArray(data.skillFocus) : (lessonTemplate?.skills ?? [])
      : [];
    const focusText = kindergarten ? String(lessonTemplate?.focus ?? "").trim() : "";
    const outcomeText = String(data.outcomeText ?? lessonTemplate?.activityDirection ?? "").trim();

    const reportContent = [
      progress ? `${kindergarten ? "課程進度" : "訓練內容"}：${progress}` : "",
      focusText ? `本堂重點：${focusText}` : "",
      outcomeText ? `成果回報：${outcomeText}` : "",
      skillFocus.length ? `能力培養：${skillFocus.join("、")}` : "",
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
        ...(representativePhotoUrl ? { reportPhotos: JSON.stringify([representativePhotoUrl]) } : {}),
        aiSummary: "",
        aiSkillFocus: "",
        aiTeachingNote: "",
      },
    });

    const notify = await notifySchoolReport(attendance.id);
    const shouldAskAssessment = await isFinalKindergartenAttendance(attendance);
    return NextResponse.json({
      ok: true,
      reportContent,
      aiSummary: "",
      aiSkillFocus: "",
      aiTeachingNote: "",
      schoolNotifyStatus: notify.status,
      schoolNotifyError: notify.error ?? "",
      shouldAskAssessment,
      assessmentUrl: shouldAskAssessment ? `/assessment/${encodeURIComponent(signPublicAccessToken("assessment", attendance.id))}` : "",
      assessmentCount: await assessmentCount(attendance.id),
    });
  } catch (e) {
    if ((e as Error).message.includes("token") || (e as Error).message.includes("Expired")) {
      return NextResponse.json({ error: "回報連結無效或已過期" }, { status: 401 });
    }
    console.error("report form save failed", e);
    return NextResponse.json({ error: `送出回報失敗：${(e as Error).message}` }, { status: 500 });
  }
}
