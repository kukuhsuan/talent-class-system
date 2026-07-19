import { NextRequest, NextResponse, after } from "next/server";
import { prisma } from "@/lib/prisma";
import { courseLabel, requiresStudentCount } from "@/lib/courseMeta";
import { normalizeAbilities } from "@/lib/abilityMap";
import { normalizeClassStatus, safeJsonArray } from "@/lib/teachingReport";
import { signPublicAccessToken, verifyPublicAccessToken } from "@/lib/publicAccessToken";
import { effectiveAttendanceTime, usableScheduledTime } from "@/lib/attendanceTime";
import { attendanceReportWindow, REPORT_LINK_EXPIRED_MESSAGE, REPORT_NOT_STARTED_MESSAGE } from "@/lib/reportWindow";
import { ensureSchoolSignatureColumns, requiresSchoolSignature, saveSchoolSignature, schoolSignatureMap, validSignatureData } from "@/lib/schoolSignature";

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
  schoolVerifierName?: string;
  schoolSignatureData?: string;
};

function progressText(item: { lesson: number; title: string }) {
  return `第${item.lesson}堂 ${item.title}`;
}

function isKindergarten(department: string | null | undefined) {
  return (department ?? "").includes("幼兒園");
}

function shouldNotifySchool(_department: string | null | undefined) {
  // 幼兒園發課後回報、安親班發評分邀請，皆由 notifySchoolReport 內部判斷
  return true;
}

// 解析 reportPhotos（JSON 陣列；相容舊資料單一字串）
function parseStoredPhotos(value: string | null | undefined): string[] {
  const raw = String(value ?? "").trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map((item) => String(item).trim()).filter(Boolean);
  } catch {
    // Older data can be a plain URL string.
  }
  return [raw];
}

function storedPhotoToUrl(stored: string, token: string) {
  if (!stored.startsWith("private:")) return stored;
  const path = stored.slice("private:".length);
  return `/api/report/${encodeURIComponent(token)}/photo?path=${encodeURIComponent(path)}`;
}

function reportPhotoUrls(value: string | null | undefined, token: string): string[] {
  return parseStoredPhotos(value).map((stored) => storedPhotoToUrl(stored, token));
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
  const { assessmentSemesterRange } = await import("@/lib/kindergartenAssessment");
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
    await ensureSchoolSignatureColumns();
    const { id } = await params;
    const { attendanceId } = verifyPublicAccessToken(decodeURIComponent(id), "report");
    const attendance = await prisma.attendance.findUnique({
      where: { id: attendanceId },
      include: { course: true, actualTeacher: true },
    });

    if (!attendance) {
      return NextResponse.json({ error: "找不到課程回報資料，可能這筆出勤已刪除或連結已失效" }, { status: 404 });
    }
    const signature = (await schoolSignatureMap([attendance.id])).get(attendance.id);
    const scheduledTime = effectiveAttendanceTime({
      scheduledTime: usableScheduledTime(attendance.scheduledTime),
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
    let progressRows = await prisma.courseProgress.findMany({
      where: { courseType: normalizedCourseType },
      orderBy: { lesson: "asc" },
      select: { id: true, courseType: true, lesson: true, title: true, createdAt: true },
    });
    if (progressRows.length === 0) {
      const { COURSE_CURRICULUM } = await import("@/lib/line");
      progressRows = (COURSE_CURRICULUM[normalizedCourseType] ?? []).map((item) => ({
        id: 0,
        courseType: normalizedCourseType,
        lesson: item.lesson,
        title: item.title,
        createdAt: new Date(),
      }));
    }

    const shouldAskAssessment = await isFinalKindergartenAttendance(attendance);
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
      representativePhotoUrl: reportPhotoUrls(attendance.reportPhotos, id)[0] ?? "",
      photoUrls: reportPhotoUrls(attendance.reportPhotos, id),
      shouldAskAssessment,
      assessmentUrl: shouldAskAssessment ? `/assessment/${encodeURIComponent(signPublicAccessToken("assessment", attendance.id))}` : "",
      assessmentCount: shouldAskAssessment ? await assessmentCount(attendance.id) : 0,
      schoolNotifyStatus: shouldNotifySchool(attendance.course.department)
        ? (attendance as unknown as { schoolNotifyStatus?: string }).schoolNotifyStatus ?? "未通知"
        : "",
      schoolNotifyError: shouldNotifySchool(attendance.course.department)
        ? (attendance as unknown as { schoolNotifyError?: string }).schoolNotifyError ?? ""
        : "",
      schoolSignatureRequired: requiresSchoolSignature(attendance.course.department, attendance.actualTeacher.name),
      schoolVerifierName: signature?.schoolVerifierName ?? "",
      schoolSignatureData: signature?.schoolSignatureData ?? "",
      schoolSignedAt: signature?.schoolSignedAt instanceof Date ? signature.schoolSignedAt.toISOString() : signature?.schoolSignedAt ?? null,
      reportFillable: reportWindow.fillable,
      reportExpired: reportWindow.expired,
      reportNotStarted: !reportWindow.ended,
      reportLocked: !reportWindow.ended || reportWindow.expired,
      reportPhotoLocked: !reportWindow.ended || (reportWindow.expired && !reportWindow.complete),
      courseEndsAt: reportWindow.endedAt.toISOString(),
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
    const {
      courseConfirmationSummary,
      getSchoolStartConfirmation,
      parseConfirmationTerm,
      semesterWesternLabel,
      termLabel,
      updateConfirmationCounts,
    } = await import("@/lib/courseConfirmation");
    const { writeAuditLog } = await import("@/lib/auditLog");
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
    await ensureSchoolSignatureColumns();
    const { id } = await params;
    const { attendanceId } = verifyPublicAccessToken(decodeURIComponent(id), "report");
    const attendance = await prisma.attendance.findUnique({
      where: { id: attendanceId },
      include: { course: true, actualTeacher: true },
    });

    if (!attendance) {
      return NextResponse.json({ error: "找不到課程回報資料，可能這筆出勤已刪除或連結已失效" }, { status: 404 });
    }
    const scheduledTime = effectiveAttendanceTime({
      scheduledTime: usableScheduledTime(attendance.scheduledTime),
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
    if (!reportWindow.ended) {
      return NextResponse.json({ error: REPORT_NOT_STARTED_MESSAGE }, { status: 409 });
    }
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
    // 照片必填：已上傳的照片或本次附上的公開連結，至少要有一張
    if (parseStoredPhotos(attendance.reportPhotos).length === 0 && !representativePhotoUrl) {
      return NextResponse.json({ error: "請至少上傳 1 張課堂活動照片" }, { status: 400 });
    }
    const incident = Boolean(data.incident);
    const signatureRequired = requiresSchoolSignature(attendance.course.department, attendance.actualTeacher.name);
    const schoolVerifierName = String(data.schoolVerifierName ?? "").trim();
    const schoolSignatureData = String(data.schoolSignatureData ?? "");
    if (signatureRequired && !schoolVerifierName) {
      return NextResponse.json({ error: "請填寫園所確認老師姓名" }, { status: 400 });
    }
    if (signatureRequired && !validSignatureData(schoolSignatureData)) {
      return NextResponse.json({ error: "請由園所老師完成手寫簽名" }, { status: 400 });
    }

    const incidentChild = String(data.incidentChild ?? "").trim();
    const incidentProcess = String(data.incidentProcess ?? "").trim();
    const incidentAction = String(data.incidentAction ?? "").trim();
    const incidentNotified = String(data.incidentNotified ?? "").trim();
    const lessonTemplate = kindergarten
      ? await (await import("@/lib/lessonTemplates")).getLessonTemplateForReport(prisma, attendance.course.courseType, progress)
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
        // 上傳照片已即時寫入 reportPhotos；此處只把「公開圖片連結」附加進陣列（上限 4，不覆蓋已上傳照片）
        ...(representativePhotoUrl && !parseStoredPhotos(attendance.reportPhotos).includes(representativePhotoUrl)
          ? { reportPhotos: JSON.stringify([...parseStoredPhotos(attendance.reportPhotos), representativePhotoUrl].slice(0, 4)) }
          : {}),
        aiSummary: "",
        aiSkillFocus: "",
        aiTeachingNote: "",
      },
    });
    if (signatureRequired) await saveSchoolSignature(attendance.id, schoolVerifierName, schoolSignatureData);
    const { writeAuditLog } = await import("@/lib/auditLog");
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
        ...(signatureRequired ? { schoolVerifierName, schoolSignedAt: "now" } : {}),
      },
      diffSummary: `老師送出課後回報：${attendance.course.school} ${courseLabel(attendance.course.courseType)}`,
    });

    // 效能：園所 LINE 通知移到回應之後的背景執行，老師送出回報不必等整條通知鏈
    const willNotify = shouldNotifySchool(attendance.course.department);
    if (willNotify) {
      after(async () => {
        try {
          await (await import("@/lib/schoolNotification")).notifySchoolReport(attendance.id);
        } catch (error) {
          console.error("background school notify failed", error);
        }
      });
    }
    const shouldAskAssessment = await isFinalKindergartenAttendance(attendance);
    return NextResponse.json({
      ok: true,
      reportContent,
      aiSummary: "",
      aiSkillFocus: "",
      aiTeachingNote: "",
      schoolNotifyStatus: willNotify ? "通知處理中" : "",
      schoolNotifyError: "",
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
