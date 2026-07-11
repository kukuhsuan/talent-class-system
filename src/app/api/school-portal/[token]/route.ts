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
} from "@/lib/courseConfirmation";
import { resolveSchoolPortalParam } from "@/lib/schoolPortalAccess";
import { writeAuditLog } from "@/lib/auditLog";
import { getTeacherResume } from "@/lib/teacherResume";
import { teacherTeachingProfiles } from "@/lib/teacherTeachingProfile";
import { attendanceHasCompletionData, courseChangeDisplay, courseChangeInclude, createCourseChangeRequest, parseChangeTypes, timeRange } from "@/lib/courseChangeRequests";
import { pushAdminAlert } from "@/lib/systemAlerts";

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
    const { schoolId } = await resolveSchoolPortalParam(token);
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
      },
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
    const { schoolId } = await resolveSchoolPortalParam(token);
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
    const { schoolId } = await resolveSchoolPortalParam(token);
    const body = await req.json().catch(() => ({}));
    const term = parseConfirmationTerm(body.confirmationTerm ?? body);
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
