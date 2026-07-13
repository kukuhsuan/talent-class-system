import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ADMIN_ROLES, BACKOFFICE_ROLES, requireRole } from "@/lib/permissions";
import { courseChangeDisplay, courseChangeInclude, createCourseChangeRequest } from "@/lib/courseChangeRequests";
import { writeAuditLog } from "@/lib/auditLog";
import { withDatabaseRetry } from "@/lib/databaseRetry";

export async function GET(req: NextRequest) {
  const auth = await requireRole(BACKOFFICE_ROLES);
  if (auth.response) return auth.response;
  const { searchParams } = new URL(req.url);
  const where: Prisma.CourseChangeRequestWhereInput = {};
  const status = searchParams.get("status")?.trim();
  const source = searchParams.get("source")?.trim();
  const school = searchParams.get("school")?.trim();
  const teacher = searchParams.get("teacher")?.trim();
  const keyword = searchParams.get("keyword")?.trim();
  const type = searchParams.get("type")?.trim();
  const from = searchParams.get("from")?.trim();
  const to = searchParams.get("to")?.trim();
  if (status) where.status = status;
  if (source) where.requestSource = source;
  if (school) where.OR = [{ originalSchoolName: { contains: school } }, { newSchoolName: { contains: school } }];
  if (teacher) where.teacher = { name: { contains: teacher } };
  if (type) where.changeTypes = { contains: type };
  if (from || to) where.createdAt = {
    ...(from ? { gte: new Date(`${from}T00:00:00.000Z`) } : {}),
    ...(to ? { lt: new Date(`${to}T23:59:59.999Z`) } : {}),
  };
  if (keyword) {
    where.AND = [{ OR: [
      { originalSchoolName: { contains: keyword } },
      { newSchoolName: { contains: keyword } },
      { course: { courseType: { contains: keyword } } },
      { teacher: { name: { contains: keyword } } },
      { requestedByName: { contains: keyword } },
    ] }];
  }
  try {
    const items = await withDatabaseRetry(() => prisma.courseChangeRequest.findMany({ where, include: courseChangeInclude, orderBy: { createdAt: "desc" } }));
    return NextResponse.json({ items: items.map(courseChangeDisplay), total: items.length });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message || "異動申請載入失敗，請稍後重試" }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireRole(ADMIN_ROLES);
  if (auth.response || !auth.user) return auth.response;
  try {
    const body = await req.json();
    const request = await createCourseChangeRequest({
      ...body,
      attendanceIds: Array.isArray(body.attendanceIds) ? body.attendanceIds : [body.attendanceId],
      requestSource: "ADMIN",
      requestedByUserId: auth.user.userId,
      requestedByName: auth.user.name,
    });
    await writeAuditLog(req, {
      action: "create",
      targetType: "CourseChangeRequest",
      targetId: request.id,
      targetLabel: `${request.originalSchoolName} ${request.course.courseType}`,
      afterData: request,
      diffSummary: `建立課程異動申請：${request.originalSchoolName} ${request.course.courseType}`,
      sensitive: true,
    });
    return NextResponse.json(courseChangeDisplay(request), { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message || "建立課程異動失敗" }, { status: 400 });
  }
}
