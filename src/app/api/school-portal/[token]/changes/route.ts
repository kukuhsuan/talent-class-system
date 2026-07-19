import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveSchoolPortalParam } from "@/lib/schoolPortalAccess";
import { writeAuditLog } from "@/lib/auditLog";
import {
  attendanceHasCompletionData,
  courseChangeDisplay,
  courseChangeInclude,
  createCourseChangeRequest,
  parseChangeTypes,
  timeRange,
} from "@/lib/courseChangeRequests";
import { pushAdminAlert } from "@/lib/systemAlerts";
import { hasValidPortalSession } from "@/lib/portalAuth";

export const dynamic = "force-dynamic";

function dateText(date: Date) {
  return date.toISOString().slice(0, 10);
}

// 安親班申請異動分頁 API：可異動課堂（未來、未回報）＋歷史申請
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const { schoolId } = await resolveSchoolPortalParam(token, req);
    const school = await prisma.school.findUnique({ where: { id: schoolId }, select: { name: true } });
    if (!school) return NextResponse.json({ error: "找不到園所" }, { status: 404 });

    const changeStart = new Date();
    changeStart.setUTCHours(0, 0, 0, 0);
    const changeEnd = new Date(changeStart);
    changeEnd.setUTCFullYear(changeEnd.getUTCFullYear() + 1);
    const [attendances, requests, schools] = await Promise.all([
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
        take: 50,
      }),
      prisma.school.findMany({ select: { id: true, name: true, region: true, address: true }, orderBy: [{ region: "asc" }, { name: "asc" }] }),
    ]);

    return NextResponse.json({
      options: attendances
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
      requests: requests.map(courseChangeDisplay),
      schools,
    }, { headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" } });
  } catch {
    return NextResponse.json({ error: "園所連結無效或已過期" }, { status: 401 });
  }
}

// 送出異動申請：需通過園所驗證碼驗證（後端檢查 Session，不只前端擋按鈕）
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const { schoolId } = await resolveSchoolPortalParam(token, req);
    if (!(await hasValidPortalSession(req, schoolId))) {
      return NextResponse.json({ error: "請先完成園所驗證", requiresVerify: true }, { status: 401 });
    }
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
