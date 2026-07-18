import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPublicAccessToken } from "@/lib/publicAccessToken";
import {
  createCourseStartConfirmation,
  currentConfirmationTerm,
  getCourseStartConfirmationByAttendance,
  getCourseStartConfirmationForCourseTerm,
  getSchoolStartConfirmation,
  LOCATION_OPTIONS,
  updateConfirmationCounts,
  upsertSchoolStartConfirmation,
} from "@/lib/courseConfirmation";

export const dynamic = "force-dynamic";

function isKindergarten(department: string | null | undefined) {
  return (department ?? "").includes("幼兒園");
}

async function loadAttendance(id: string) {
  const { attendanceId } = verifyPublicAccessToken(decodeURIComponent(id), "report");
  const attendance = await prisma.attendance.findUnique({
    where: { id: attendanceId },
    include: { course: true, actualTeacher: { select: { id: true, name: true } } },
  });
  if (!attendance) throw new Error("找不到課程資料，連結可能已失效");
  return attendance;
}

async function resolveSchoolId(attendance: { scheduledSchoolId: number | null; course: { schoolId: number | null; school: string } }) {
  if (attendance.scheduledSchoolId) return attendance.scheduledSchoolId;
  if (attendance.course.schoolId) return attendance.course.schoolId;
  const school = await prisma.school.findFirst({ where: { name: attendance.course.school }, select: { id: true } });
  return school?.id ?? 0;
}

// 老師端：查詢此堂課是否需要填寫開課前確認（幼兒園限定、每課程每學期一次）
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const attendance = await loadAttendance(id);
    if (!isKindergarten(attendance.course.department)) {
      return NextResponse.json({ eligible: false, record: null });
    }
    const term = currentConfirmationTerm(attendance.date);
    const record =
      (await getCourseStartConfirmationByAttendance(attendance.id)) ??
      (await getCourseStartConfirmationForCourseTerm(attendance.courseId, term));
    return NextResponse.json({ eligible: !record && !attendance.cancelled, record });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message || "連結無效" }, { status: 401 });
  }
}

// 老師端：送出開課前確認（同課程本學期僅能一次）
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const attendance = await loadAttendance(id);
    if (!isKindergarten(attendance.course.department)) {
      return NextResponse.json({ error: "此課程不需填寫開課前確認" }, { status: 400 });
    }
    if (attendance.cancelled) {
      return NextResponse.json({ error: "此堂課已停課" }, { status: 400 });
    }
    const term = currentConfirmationTerm(attendance.date);
    const existing =
      (await getCourseStartConfirmationByAttendance(attendance.id)) ??
      (await getCourseStartConfirmationForCourseTerm(attendance.courseId, term));
    if (existing) {
      return NextResponse.json({ error: "此課程已完成開課前確認", record: existing }, { status: 409 });
    }
    const body = await req.json();
    const schoolId = await resolveSchoolId(attendance);
    const record = await createCourseStartConfirmation({
      attendanceId: attendance.id,
      schoolId,
      courseId: attendance.courseId,
      courseName: attendance.course.courseType,
      schoolName: attendance.scheduledSchoolName?.trim() || attendance.course.school,
      date: attendance.date.toISOString().slice(0, 10),
      teacherId: attendance.actualTeacherId,
      teacherName: attendance.actualTeacher?.name ?? "",
      toddlerClassCount: body.toddlerClassCount,
      smallClassCount: body.smallClassCount,
      middleClassCount: body.middleClassCount,
      bigClassCount: body.bigClassCount,
      location: body.location,
      classNotes: body.classNotes,
    });
    // 同步園所學期設定（人數＋地點＋注意事項），供園所端與後台既有畫面查看
    if (schoolId && record) {
      await updateConfirmationCounts({
        schoolId,
        term,
        toddlerClassCount: record.toddlerClassCount,
        smallClassCount: record.smallClassCount,
        middleClassCount: record.middleClassCount,
        bigClassCount: record.bigClassCount,
        note: `${record.courseName} 開課前確認（老師填寫）`,
        teacherId: attendance.actualTeacherId,
      }).catch(() => undefined);
      const current = await getSchoolStartConfirmation(schoolId, term);
      const locationText = record.location.trim();
      const isOption = (LOCATION_OPTIONS as readonly string[]).includes(locationText);
      await upsertSchoolStartConfirmation(schoolId, term, {
        ...current,
        location: locationText ? (isOption ? locationText : "其他") : current.location,
        otherLocation: locationText && !isOption ? locationText : current.otherLocation,
        classNotes: record.classNotes || current.classNotes,
      }, { submit: false }).catch(() => undefined);
    }
    return NextResponse.json({ record }, { status: 201 });
  } catch (error) {
    const message = (error as Error).message || "送出失敗";
    const conflict = message.includes("UNIQUE");
    return NextResponse.json(
      { error: conflict ? "此課程已完成開課前確認" : message },
      { status: conflict ? 409 : 400 },
    );
  }
}
