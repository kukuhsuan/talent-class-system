import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { courseLabel, requiresStudentCount } from "@/lib/courseMeta";
import { normalizeAbilities } from "@/lib/abilityMap";
import { normalizeClassStatus, safeJsonArray } from "@/lib/teachingReport";
import { COURSE_CURRICULUM } from "@/lib/line";
import { notifySchoolReport } from "@/lib/schoolNotification";
import { getLessonTemplateForReport, listLessonTemplates } from "@/lib/lessonTemplates";
import { signPublicAccessToken, verifyPublicAccessToken } from "@/lib/publicAccessToken";
import { attendanceScheduledTimeMap, effectiveAttendanceTime } from "@/lib/attendanceTime";
import { attendanceReportWindow, REPORT_LINK_EXPIRED_MESSAGE } from "@/lib/reportWindow";
import { assessmentSemesterRange } from "@/lib/kindergartenAssessment";
import {
  confirmationHistory,
  courseConfirmationSummary,
  getSchoolStartConfirmation,
  parseConfirmationTerm,
  semesterWesternLabel,
  termLabel,
  updateConfirmationCounts,
} from "@/lib/courseConfirmation";
import { writeAuditLog } from "@/lib/auditLog";

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

function shouldNotifySchool(department: string | null | undefined) {
  return !(department ?? "").includes("安親");
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
  const semester = assessmentSemesterRange(attendance.date);
  const latest = await prisma.attendance.findFirst({
    where: {
      courseId: attendance.courseId,
      cancelled: false,
      date: { gte: semester.start, lt: semester.end },
    },
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
    const timeMap = await attendanceScheduledTimeMap([attendance.id]);
    const scheduledTime = effectiveAttendanceTime({
      scheduledTime: timeMap.get(attendance.id),
      courseTime: attendance.course.time,
      attendanceHours: attendance.hours,
      isPayrollLocked: attendance.isPayrollLocked,
      reportContent: attendance.reportContent,
      reportSentAt: attendance.reportSentAt,
      studentCount: attendance.studentCount,
      studentCountA: attendance.studentCountA,
      studentCountB: attendance.studentCountB,
    });
    const reportWindow = attendanceReportWindow(attendance, scheduledTime);
    if (reportWindow.expired && !reportWindow.complete) {
      return NextResponse.json({ error: REPORT_LINK_EXPIRED_MESSAGE }, { status: 410 });
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

    const shouldAskAssessment = await isFinalKindergartenAttendance(attendance);
    const term = parseConfirmationTerm({});
    const courseSchoolId = attendance.course.schoolId ?? null;
    const courseConfirmation = courseSchoolId ? await getSchoolStartConfirmation(courseSchoolId, term) : null;
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
      courseConfirmation,
      courseConfirmationSummary: courseConfirmation ? courseConfirmationSummary(courseConfirmation, { multiline: true, teacher: true }) : "",
      courseConfirmationHistory: courseConfirmation?.id ? await confirmationHistory(courseConfirmation.id) : [],
      confirmationTerm: {
        ...term,
        label: termLabel(term),
        westernLabel: semesterWesternLabel(term),
      },
      shouldAskAssessment,
      assessmentUrl: shouldAskAssessment ? `/assessment/${encodeURIComponent(signPublicAccessToken("assessment", attendance.id))}` : "",
      assessmentCount: await assessmentCount(attendance.id),
      schoolNotifyStatus: shouldNotifySchool(attendance.course.department)
        ? (attendance as unknown as { schoolNotifyStatus?: string }).schoolNotifyStatus ?? "未通知"
        : "",
      schoolNotifyError: shouldNotifySchool(attendance.course.department)
        ? (attendance as unknown as { schoolNotifyError?: string }).schoolNotifyError ?? ""
        : "",
      reportFillable: reportWindow.fillable,
      reportExpired: reportWindow.expired,
      reportLocked: reportWindow.expired,
      reportPhotoLocked: reportWindow.expired && !reportWindow.complete,
      reportExpiresAt: reportWindow.expiresAt.toISOString(),
    });
  } catch (e) {
    if ((e as Error).message.includes("token") || (e as Error).message.includes("Expired")) {
      return NextResponse.json({ error: "回報連結無效或已過期" }, { status: 401 });
    }
    console.error("report form load failed", e);
    return NextResponse.json({ error: `讀取回報表單失敗：${(e as Error).message}` }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { attendanceId } = verifyPublicAccessToken(decodeURIComponent(id), "report");
    const attendance = await prisma.attendance.findUnique({
      where: { id: attendanceId },
      include: { course: true, actualTeacher: true },
    });
    if (!attendance?.course.schoolId) {
      return NextResponse.json({ error: "找不到園所資料，無法更新班級人數" }, { status: 404 });
    }
    const body = await req.json().catch(() => ({}));
    if (body.type !== "confirmation_counts") {
      return NextResponse.json({ error: "Unknown update type" }, { status: 400 });
    }
    const term = parseConfirmationTerm(body.confirmationTerm ?? body);
    const previousConfirmation = await getSchoolStartConfirmation(attendance.course.schoolId, term);
    const courseConfirmation = await updateConfirmationCounts({
      schoolId: attendance.course.schoolId,
      term,
      smallClassCount: body.smallClassCount,
      middleClassCount: body.middleClassCount,
      bigClassCount: body.bigClassCount,
      note: body.note,
      teacherId: attendance.actualTeacherId,
    });
    await writeAuditLog(req, {
      actorName: attendance.actualTeacher.name,
      actorRole: "teacher",
      action: "update",
      targetType: "SchoolStartConfirmation",
      targetId: courseConfirmation.id ?? "",
      targetLabel: `${attendance.course.school} ${termLabel(term)}`,
      beforeData: previousConfirmation,
      afterData: {
        smallClassCount: courseConfirmation.smallClassCount,
        middleClassCount: courseConfirmation.middleClassCount,
        bigClassCount: courseConfirmation.bigClassCount,
        note: body.note ?? "",
      },
      diffSummary: `老師更新班級人數：${courseConfirmationSummary(courseConfirmation, { includeTerm: true })}`,
    });
    return NextResponse.json({
      ok: true,
      courseConfirmation,
      courseConfirmationSummary: courseConfirmationSummary(courseConfirmation, { multiline: true, teacher: true }),
      courseConfirmationHistory: courseConfirmation.id ? await confirmationHistory(courseConfirmation.id) : [],
      confirmationTerm: {
        ...term,
        label: termLabel(term),
        westernLabel: semesterWesternLabel(term),
      },
    });
  } catch (e) {
    if ((e as Error).message.includes("token") || (e as Error).message.includes("Expired")) {
      return NextResponse.json({ error: "回報連結無效或已過期" }, { status: 401 });
    }
    console.error("confirmation count update failed", e);
    return NextResponse.json({ error: `班級人數更新失敗：${(e as Error).message}` }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
    const timeMap = await attendanceScheduledTimeMap([attendance.id]);
    const scheduledTime = effectiveAttendanceTime({
      scheduledTime: timeMap.get(attendance.id),
      courseTime: attendance.course.time,
      attendanceHours: attendance.hours,
      isPayrollLocked: attendance.isPayrollLocked,
      reportContent: attendance.reportContent,
      reportSentAt: attendance.reportSentAt,
      studentCount: attendance.studentCount,
      studentCountA: attendance.studentCountA,
      studentCountB: attendance.studentCountB,
    });
    const reportWindow = attendanceReportWindow(attendance, scheduledTime);
    if (reportWindow.expired) {
      return NextResponse.json({ error: REPORT_LINK_EXPIRED_MESSAGE }, { status: 410 });
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
      ? normalizeAbilities(safeJsonArray(data.skillFocus), 4)
      : [];
    if (kindergarten && skillFocus.length < 3) {
      return NextResponse.json({ error: "請選擇 3～4 個本堂學習目標" }, { status: 400 });
    }
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
    await writeAuditLog(req, {
      actorName: attendance.actualTeacher.name,
      actorRole: "teacher",
      action: "update",
      targetType: "Attendance",
      targetId: attendance.id,
      targetLabel: `${attendance.date.toISOString().slice(0, 10)} ${attendance.course.school} ${courseLabel(attendance.course.courseType)}`,
      beforeData: {
        studentCount: attendance.studentCount,
        reportContent: attendance.reportContent,
        reportSentAt: attendance.reportSentAt,
      },
      afterData: {
        studentCount: data.studentCount == null ? attendance.studentCount : Number(data.studentCount),
        reportContent,
        reportSentAt: "now",
      },
      diffSummary: `老師送出課後回報：${attendance.course.school} ${courseLabel(attendance.course.courseType)}`,
    });

    const notify = shouldNotifySchool(attendance.course.department)
      ? await notifySchoolReport(attendance.id)
      : { status: "", error: "" };
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
