import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { courseLabel, normalizeDepartment } from "@/lib/courseMeta";
import {
  canEditSubmittedConfirmation,
  confirmationHistory,
  copyPreviousSchoolStartConfirmation,
  courseConfirmationSummary,
  getSchoolStartConfirmation,
  parseConfirmationTerm,
  semesterWesternLabel,
  termLabel,
  upsertSchoolStartConfirmation,
  confirmationTermRange,
  listCourseStartConfirmationsBySchool,
  createCourseStartConfirmation,
  updateCourseStartConfirmation,
} from "@/lib/courseConfirmation";
import { resolveSchoolPortalParam } from "@/lib/schoolPortalAccess";
import { writeAuditLog } from "@/lib/auditLog";
import { getTeacherResume } from "@/lib/teacherResume";
import { teacherTeachingProfiles } from "@/lib/teacherTeachingProfile";
import { attendanceHasCompletionData, courseChangeDisplay, courseChangeInclude, createCourseChangeRequest, parseChangeTypes, timeRange } from "@/lib/courseChangeRequests";
import { pushAdminAlert } from "@/lib/systemAlerts";
import { ensureCourseRatingTables, normalizeRatingRow, openEligibleRatings, type CourseRatingRow } from "@/lib/courseRating";
import { ensureSchoolInvoiceTables, invoiceMonthKey } from "@/lib/schoolInvoices";
import { courseTermOverride } from "@/lib/courseTerm";

function countOf(row: { studentCount: number | null; studentCountA?: number | null; studentCountB?: number | null }) {
  if (row.studentCountA != null || row.studentCountB != null) return (row.studentCountA ?? 0) + (row.studentCountB ?? 0);
  return row.studentCount ?? 0;
}

function dateText(date: Date) {
  return date.toISOString().slice(0, 10);
}

function monthRange(year: number, month: number) {
  const now = new Date();
  const safeYear = Number.isFinite(year) && year >= 2020 && year <= 2035 ? year : now.getFullYear();
  const safeMonth = Number.isFinite(month) && month >= 1 && month <= 12 ? month : now.getMonth() + 1;
  return {
    year: safeYear,
    month: safeMonth,
    start: new Date(safeYear, safeMonth - 1, 1),
    end: new Date(safeYear, safeMonth, 1),
  };
}

// 解析 reportPhotos（JSON 陣列字串；相容舊資料的單一網址）
function parseStoredPhotos(value: string | null | undefined): string[] {
  const raw = String(value ?? "").trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map((item) => String(item).trim()).filter(Boolean);
  } catch {
    // Existing rows may contain a plain URL.
  }
  return [raw];
}

function toPortalUrl(stored: string, token: string) {
  if (!stored.startsWith("private:")) return stored;
  const path = stored.slice("private:".length);
  return `/api/school-portal/${encodeURIComponent(token)}/photo?path=${encodeURIComponent(path)}`;
}

function portalPhotoUrls(value: string | null | undefined, token: string): string[] {
  return parseStoredPhotos(value).map((stored) => toPortalUrl(stored, token));
}

function portalPhotoUrl(value: string | null | undefined, token: string) {
  return portalPhotoUrls(value, token)[0] ?? "";
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

function splitResumeItems(value: string) {
  return String(value ?? "")
    .split(/\n|、|，|,|；|;/)
    .map((item) => item.replace(/^[-•●\s]+/, "").trim())
    .filter(Boolean);
}

function resumeSummary(value: string) {
  return splitResumeItems(value)[0] ?? "";
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const { schoolId } = await resolveSchoolPortalParam(token, req);
    const { searchParams } = new URL(req.url);
    const selectedMonth = monthRange(
      Number(searchParams.get("year") ?? new Date().getFullYear()),
      Number(searchParams.get("month") ?? new Date().getMonth() + 1),
    );
    const term = parseConfirmationTerm({
      academicYear: searchParams.get("academicYear"),
      semester: searchParams.get("semester"),
    });

    const [school, skillCards] = await Promise.all([
      prisma.school.findUnique({ where: { id: schoolId } }),
      getSkillCards(),
    ]);
    if (!school) return NextResponse.json({ error: "找不到園所" }, { status: 404 });
    const courseConfirmation = await getSchoolStartConfirmation(schoolId, term);
    const history = courseConfirmation.id ? await confirmationHistory(courseConfirmation.id) : [];

    if (searchParams.get("confirmationOnly") === "1") {
      const termRange = confirmationTermRange(term);
      const [courses, confirmations] = await Promise.all([
        prisma.course.findMany({
          where: {
            isActive: true,
            OR: [{ schoolId }, { school: school.name }],
          },
          select: {
            id: true, code: true, courseType: true, notes: true,
            teacher: { select: { name: true } },
            attendances: { where: { date: { gte: termRange.start, lt: termRange.end } }, select: { id: true }, take: 1 },
          },
          orderBy: [{ courseType: "asc" }, { code: "asc" }],
        }),
        listCourseStartConfirmationsBySchool(schoolId, term),
      ]);
      const byCourse = new Map(confirmations.map((item) => [item.courseId, item]));
      const currentTermLabel = `${term.academicYear}-${term.semester}`;
      const currentCourses = courses.filter((course) => {
        const override = courseTermOverride(course.notes);
        return override ? override === currentTermLabel : course.attendances.length > 0;
      });
      return NextResponse.json({
        school: { name: school.name, type: school.type },
        confirmationTerm: { ...term, label: termLabel(term), westernLabel: semesterWesternLabel(term) },
        confirmationCourses: currentCourses.map((course) => ({
          id: course.id,
          label: `${courseTermOverride(course.notes) || currentTermLabel}｜${courseLabel(course.courseType) || course.courseType}（${course.code}）`,
          teacherName: course.teacher.name,
          confirmation: byCourse.get(course.id) ?? null,
        })),
      }, { headers: { "Cache-Control": "private, max-age=30" } });
    }

    const records = await prisma.attendance.findMany({
      where: {
        date: { gte: selectedMonth.start, lt: selectedMonth.end },
        OR: [
          { scheduledSchoolId: schoolId },
          { scheduledSchoolId: null, course: { OR: [{ schoolId }, { school: school.name }] } },
        ],
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
      scheduledSchoolName: string;
      scheduledTime: string | null;
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
      actualTeacherId: number;
      course: { id: number; school: string; courseType: string; department: string; category: string; time: string };
      assessments: Array<{ id: number; childName: string; courseName: string; scores: string; comment: string; title: string; createdAt: Date }>;
    }>;

    const activeCourses = await prisma.course.findMany({
      where: {
        isActive: true,
        OR: [{ schoolId }, { school: school.name }],
      },
      include: {
        teacher: true,
        assistantTeacher: true,
      },
      orderBy: [{ courseType: "asc" }, { id: "asc" }],
    }) as unknown as Array<{
      id: number;
      courseType: string;
      teacherId: number;
      assistantTeacherId: number | null;
      teacher: { id: number; name: string };
      assistantTeacher: { id: number; name: string } | null;
    }>; 

    const changeStart = new Date();
    changeStart.setUTCHours(0, 0, 0, 0);
    const changeEnd = new Date(changeStart);
    changeEnd.setUTCFullYear(changeEnd.getUTCFullYear() + 1);
    const [changeAttendances, changeRequests, changeSchools] = await Promise.all([
      prisma.attendance.findMany({
        where: {
          date: { gte: changeStart, lt: changeEnd },
          cancelled: false,
          OR: [
            { scheduledSchoolId: schoolId },
            { scheduledSchoolId: null, course: { OR: [{ schoolId }, { school: school.name }] } },
          ],
        },
        include: { course: { include: { schoolRel: true } }, actualTeacher: { select: { id: true, name: true } } },
        orderBy: { date: "asc" },
      }),
      prisma.courseChangeRequest.findMany({
        where: { OR: [{ requestedBySchoolId: schoolId }, { originalSchoolId: schoolId }] },
        include: courseChangeInclude,
        orderBy: { createdAt: "desc" },
      }),
      prisma.school.findMany({ select: { id: true, name: true, region: true, address: true }, orderBy: [{ region: "asc" }, { name: "asc" }] }),
    ]);

    const visibleReports = records.filter((r) =>
      r.reportContent || r.aiSummary || r.aiTeachingNote || r.skillFocus || r.classStatus || r.incident
    );

    const reports = visibleReports.map((r) => ({
      id: r.id,
      date: dateText(r.date),
      school: r.scheduledSchoolName.trim() || r.course.school,
      courseType: r.course.courseType,
      courseName: courseLabel(r.course.courseType),
      department: normalizeDepartment(r.course.department),
      category: r.course.category,
      time: r.scheduledTime?.trim() || r.course.time,
      teacherName: r.actualTeacher.name,
      studentCount: countOf(r),
      reportContent: r.reportContent,
      skillFocus: r.skillFocus,
      classStatus: r.classStatus,
      incident: r.incident,
      // 園所端只顯示對外摘要，避免公開孩子姓名與內部處理細節。
      incidentChild: "",
      incidentProcess: r.incident ? "本堂課有特殊狀況，已由老師與行政依流程處理。" : "",
      incidentAction: r.incidentNotified === "是" ? "已通知園所窗口。" : "如需詳細資訊，請洽行政窗口。",
      incidentNotified: r.incidentNotified,
      aiSummary: r.aiSummary,
      aiSkillFocus: r.aiSkillFocus,
      aiTeachingNote: r.aiTeachingNote,
      representativePhotoUrl: portalPhotoUrl(r.reportPhotos, token),
      photoUrls: portalPhotoUrls(r.reportPhotos, token),
      schoolNotifyStatus: r.schoolNotifyStatus,
    }));

    const monthlyRows = records.filter((r) => !r.cancelled).map((r) => ({
      id: r.id,
      date: dateText(r.date),
      courseName: courseLabel(r.course.courseType),
      teacherName: r.actualTeacher.name,
      time: r.scheduledTime?.trim() || r.course.time,
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
    const teacherMap = new Map<number, { id: number; name: string; courseNames: Set<string>; courseTypes: Set<string> }>();
    const addTeacher = (teacher: { id: number; name: string } | null | undefined, courseType: string) => {
      if (!teacher?.id) return;
      const current = teacherMap.get(teacher.id) ?? { id: teacher.id, name: teacher.name, courseNames: new Set<string>(), courseTypes: new Set<string>() };
      current.courseTypes.add(courseType);
      current.courseNames.add(courseLabel(courseType));
      teacherMap.set(teacher.id, current);
    };
    for (const course of activeCourses) {
      addTeacher(course.teacher, course.courseType);
      addTeacher(course.assistantTeacher, course.courseType);
    }
    for (const record of records.filter((row) => !row.cancelled)) {
      addTeacher({ id: record.actualTeacherId, name: record.actualTeacher.name }, record.course.courseType);
    }
    const teacherIds = [...teacherMap.keys()];
    const [profiles, resumes] = await Promise.all([
      teacherTeachingProfiles(prisma, teacherIds),
      Promise.all(teacherIds.map((id) => getTeacherResume(id))),
    ]);
    const resumeByTeacher = new Map(resumes.filter(Boolean).map((resume) => [resume!.teacherId, resume!]));
    const teachers = teacherIds.map((id) => {
      const base = teacherMap.get(id)!;
      const resume = resumeByTeacher.get(id);
      const profile = profiles.get(id) ?? null;
      return {
        id,
        name: base.name,
        cardUrl: `/teacher-card/${id}`,
        courseNames: [...base.courseNames].filter(Boolean).sort((a, b) => a.localeCompare(b, "zh-Hant")),
        courseTypes: [...base.courseTypes],
        photoUrl: resume?.photoUrl ?? "",
        specialties: resume?.specialties ?? "",
        specialtyTags: splitResumeItems(resume?.specialties ?? "").slice(0, 6),
        educationSummary: resumeSummary(resume?.education ?? ""),
        experienceSummary: resumeSummary(resume?.experience ?? ""),
        certificationsSummary: resumeSummary(resume?.certifications ?? ""),
        teachingStyle: resume?.teachingStyle ?? "",
        intro: resume?.intro ?? "",
        status: resume?.status ?? "未填寫",
        primaryRegionLabel: profile?.primaryRegionLabel ?? "",
        primarySpecialtyLabel: profile?.primarySpecialtyLabel ?? "",
        primaryCourseTypes: profile?.primaryCourseTypes ?? [],
      };
    }).sort((a, b) => a.name.localeCompare(b.name, "zh-Hant"));

    // 園所看板：統計、歷史評分（幼兒園＋安親班）、當月請款狀態
    const cancelledLessons = records.filter((r) => r.cancelled).length;
    const reportedLessons = records.filter((r) => !r.cancelled && r.reportContent.trim()).length;

    let ratings: Array<{ date: string; courseName: string; teacherName: string; scorePunctuality: number; scoreTeaching: number; scoreOrder: number; scoreInteraction: number; scoreOverall: number; continueWish: string; feedback: string }> = [];
    // 每堂課評分入口：待填寫（open）與已完成（submitted）狀態＋評分連結
    let ratingTasks: Array<{ attendanceId: number; date: string; courseName: string; teacherName: string; status: string; ratingUrl: string }> = [];
    if (records.length) {
      await ensureCourseRatingTables();
      // 幼兒園＋安親班共用：課已結束＋已回報＋未取消 → 自動補建 open 評分任務
      await openEligibleRatings(records.map((r) => ({
        id: r.id,
        date: r.date,
        cancelled: r.cancelled,
        reportContent: r.reportContent,
        studentCount: r.studentCount,
        studentCountA: r.studentCountA,
        studentCountB: r.studentCountB,
        scheduledTime: r.scheduledTime,
        courseTime: r.course.time,
      }))).catch(() => undefined);
      const ids = records.map((r) => r.id);
      const rows = await prisma.$queryRawUnsafe<CourseRatingRow[]>(
        `SELECT * FROM CourseRating WHERE attendanceId IN (${ids.map(() => "?").join(",")})`,
        ...ids,
      );
      const byId = new Map(records.map((r) => [r.id, r]));
      const normalized = rows.map(normalizeRatingRow);
      ratings = normalized.filter((row) => row.status === "submitted").map((row) => {
        const record = byId.get(row.attendanceId)!;
        return {
          date: dateText(record.date),
          courseName: courseLabel(record.course.courseType),
          teacherName: record.actualTeacher.name,
          scorePunctuality: row.scorePunctuality,
          scoreTeaching: row.scoreTeaching,
          scoreOrder: row.scoreOrder,
          scoreInteraction: row.scoreInteraction,
          scoreOverall: row.scoreOverall,
          continueWish: row.continueWish,
          feedback: row.feedback,
        };
      }).sort((a, b) => b.date.localeCompare(a.date));
      // 只顯示已開放的評分（open/submitted/closed）；未達條件的課堂不顯示，不出現「尚未開放」
      const rowByAttendance = new Map(normalized.map((row) => [row.attendanceId, row]));
      ratingTasks = records.filter((r) => !r.cancelled && rowByAttendance.has(r.id)).map((record) => {
        const row = rowByAttendance.get(record.id)!;
        return {
          attendanceId: record.id,
          date: dateText(record.date),
          courseName: courseLabel(record.course.courseType),
          teacherName: record.actualTeacher.name,
          status: row.status,
          ratingUrl: `/rating/${encodeURIComponent(row.token)}`,
        };
      }).sort((a, b) => b.date.localeCompare(a.date));
    }

    let invoice: { invoiceMonth: string; status: string; totalAmount: number; taxType: string } | null = null;
    try {
      await ensureSchoolInvoiceTables();
      const invoiceRows = await prisma.$queryRawUnsafe<Array<{ invoiceMonth: string; status: string; totalAmount: number | bigint; taxType: string }>>(
        `SELECT "invoiceMonth", "status", "totalAmount", "taxType" FROM "SchoolInvoice" WHERE "schoolId" = ? AND "invoiceMonth" = ? AND "status" != '已作廢' ORDER BY id DESC LIMIT 1`,
        schoolId,
        invoiceMonthKey(selectedMonth.year, selectedMonth.month),
      );
      if (invoiceRows.length) {
        invoice = { ...invoiceRows[0], totalAmount: Number(invoiceRows[0].totalAmount) };
      }
    } catch {
      // 請款表尚未建立時不影響看板其他資料
    }

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
      courseConfirmation,
      courseConfirmationHistory: history,
      confirmationTerm: {
        ...term,
        label: termLabel(term),
        westernLabel: semesterWesternLabel(term),
      },
      year: selectedMonth.year,
      month: selectedMonth.month,
      summary: {
        reports: reports.length,
        lessons: monthlyRows.length,
        totalPeople,
        assessments: assessments.length,
        cancelledLessons,
        reportedLessons,
        reportRate: monthlyRows.length ? Math.round((reportedLessons / monthlyRows.length) * 100) : 0,
      },
      ratings,
      ratingTasks,
      invoice,
      generatedAt: new Date().toISOString(),
      reports,
      teachers,
      monthlyRows,
      curriculum,
      assessments,
      skillCards,
      courseChangeOptions: changeAttendances
        .filter((attendance) => !attendance.isPayrollLocked && !attendanceHasCompletionData(attendance))
        .map((attendance) => ({
          id: attendance.id,
          courseId: attendance.courseId,
          date: dateText(attendance.date),
          time: attendance.scheduledTime?.trim() || attendance.course.time,
          schoolId: attendance.scheduledSchoolId ?? attendance.course.schoolId,
          school: attendance.scheduledSchoolName.trim() || attendance.course.school,
          address: attendance.scheduledAddress.trim() || attendance.course.address || attendance.course.schoolRel?.address || "",
          location: attendance.scheduledLocation.trim() || attendance.course.location || "",
          courseType: attendance.course.courseType,
          teacherId: attendance.actualTeacherId,
          teacherName: attendance.actualTeacher.name,
        })),
      courseChangeRequests: changeRequests.map(courseChangeDisplay),
      courseChangeSchools: changeSchools,
    });
  } catch {
    return NextResponse.json({ error: "園所連結無效或已過期" }, { status: 401 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const { schoolId } = await resolveSchoolPortalParam(token, req);
    const body = await req.json();
    const school = await prisma.school.findUnique({ where: { id: schoolId } });
    if (!school) return NextResponse.json({ error: "找不到園所" }, { status: 404 });
    const request = await createCourseChangeRequest({
      ...body,
      attendanceIds: Array.isArray(body.attendanceIds) ? body.attendanceIds : [body.attendanceId],
      requestSource: "SCHOOL",
      requestedBySchoolId: schoolId,
      requestedByName: school.contact || school.name,
    });
    await writeAuditLog(req, {
      actorName: school.contact || school.name,
      actorRole: "school_portal",
      action: "create",
      targetType: "CourseChangeRequest",
      targetId: request.id,
      targetLabel: `${school.name} ${request.course.courseType}`,
      afterData: request,
      diffSummary: `園所送出課程異動申請：${school.name} ${request.course.courseType}`,
      sensitive: true,
    });
    const types = parseChangeTypes(request.changeTypes);
    const typeLabels: Record<string, string> = { DATE: "日期", TIME: "時間", LOCATION: "地點", STUDENT_COUNT: "人數", CANCEL: "停課" };
    const changeRows: string[] = [];
    if (types.includes("DATE")) changeRows.push(`日期 ${request.originalDate.toISOString().slice(0, 10)} → ${request.newDate?.toISOString().slice(0, 10) ?? "待確認"}`);
    if (types.includes("TIME")) changeRows.push(`時間 ${timeRange(request.originalStartTime, request.originalEndTime)} → ${timeRange(request.newStartTime, request.newEndTime)}`);
    if (types.includes("LOCATION")) changeRows.push(`地點 → ${[request.newSchoolName, request.newLocation].filter(Boolean).join("・") || "待確認"}`);
    if (types.includes("STUDENT_COUNT")) changeRows.push(`人數 → ${request.newStudentCount ?? "待確認"} 人`);
    if (types.includes("CANCEL")) changeRows.push(`停課 ${request.originalDate.toISOString().slice(0, 10)}`);
    await pushAdminAlert([
      `📋【課程異動申請】${school.name} 從園所頁面送出申請 #${request.id}`,
      `課程｜${request.course.courseType}（老師：${request.teacher.name}）`,
      `類型｜${types.map((t) => typeLabels[t] ?? t).join("、")}`,
      ...changeRows,
      `原因｜${[request.reasonType, request.reasonNote].filter(Boolean).join("：")}`,
      `請至系統「課程異動申請」頁面審核。`,
    ].join("\n")).catch((error) => console.error("pushAdminAlert failed:", error));
    return NextResponse.json(courseChangeDisplay(request), { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message || "送出異動申請失敗" }, { status: 400 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const { schoolId } = await resolveSchoolPortalParam(token, req);
    const body = await req.json().catch(() => ({}));
    const term = parseConfirmationTerm(body.confirmationTerm ?? body);
    const courseId = Number(body.courseId);
    if (Number.isFinite(courseId) && courseId > 0) {
      const school = await prisma.school.findUnique({ where: { id: schoolId }, select: { name: true } });
      if (!school) return NextResponse.json({ error: "找不到園所" }, { status: 404 });
      const course = await prisma.course.findFirst({
        where: { id: courseId, OR: [{ schoolId }, { school: school.name }] },
        select: { id: true, courseType: true, teacherId: true, teacher: { select: { name: true } } },
      });
      if (!course) return NextResponse.json({ error: "找不到這堂課程" }, { status: 404 });
      const range = confirmationTermRange(term);
      const attendance = await prisma.attendance.findFirst({
        where: { courseId, date: { gte: range.start, lt: range.end } },
        orderBy: { date: "asc" },
      });
      if (!attendance) return NextResponse.json({ error: "這堂課本學期尚無上課日期，請先完成排課" }, { status: 400 });
      const existing = (await listCourseStartConfirmationsBySchool(schoolId, term)).find((item) => item.courseId === courseId);
      const form = body.courseConfirmation ?? body;
      const location = form.location === "其他" ? form.otherLocation : form.location;
      const classNotes = [form.classNotes, form.rainyLocation ? `雨天：${form.rainyLocation}` : "", form.otherReminders].filter(Boolean).join("；");
      const saved = existing
        ? await updateCourseStartConfirmation(existing.id, { ...form, location, classNotes })
        : await createCourseStartConfirmation({
            attendanceId: attendance.id, schoolId, courseId, courseName: courseLabel(course.courseType), schoolName: school.name,
            date: attendance.date.toISOString().slice(0, 10), teacherId: course.teacherId, teacherName: course.teacher.name,
            ...form, location, classNotes,
          });
      return NextResponse.json({ ok: true, courseConfirmation: saved });
    }
    const [school, current] = await Promise.all([
      prisma.school.findUnique({ where: { id: schoolId }, select: { name: true } }),
      getSchoolStartConfirmation(schoolId, term),
    ]);
    if (!canEditSubmittedConfirmation(current.submittedAt, current.reopenedAt)) {
      return NextResponse.json({ error: "開課前確認已送出，如需修改請聯繫行政協助調整。" }, { status: 409 });
    }
    const courseConfirmation = body.action === "copyPrevious"
      ? await copyPreviousSchoolStartConfirmation(schoolId, term)
      : await upsertSchoolStartConfirmation(schoolId, term, body.courseConfirmation ?? body);
    await writeAuditLog(req, {
      actorName: school?.name ?? "園所端",
      actorRole: "school_portal",
      action: body.action === "copyPrevious" ? "create" : "update",
      targetType: "SchoolStartConfirmation",
      targetId: courseConfirmation.id ?? `${schoolId}-${term.academicYear}-${term.semester}`,
      targetLabel: `${school?.name ?? "園所"} ${termLabel(term)}`,
      beforeData: current,
      afterData: courseConfirmation,
      diffSummary: body.action === "copyPrevious"
        ? `園所複製上一學期開課前確認：${courseConfirmationSummary(courseConfirmation, { includeTerm: true })}`
        : `園所送出開課前確認：${courseConfirmationSummary(courseConfirmation, { includeTerm: true })}`,
    });
    return NextResponse.json({
      ok: true,
      courseConfirmation,
      courseConfirmationHistory: courseConfirmation.id ? await confirmationHistory(courseConfirmation.id) : [],
      confirmationTerm: {
        ...term,
        label: termLabel(term),
        westernLabel: semesterWesternLabel(term),
      },
    });
  } catch {
    return NextResponse.json({ error: "園所連結無效或已過期" }, { status: 401 });
  }
}
