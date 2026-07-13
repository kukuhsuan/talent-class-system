import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { BACKOFFICE_ROLES, requireRole } from "@/lib/permissions";
import { attendanceHasCompletionData } from "@/lib/courseChangeRequests";
import { taipeiDateIso } from "@/lib/courseDates";
import { withDatabaseRetry } from "@/lib/databaseRetry";

export async function GET() {
  const auth = await requireRole(BACKOFFICE_ROLES);
  if (auth.response) return auth.response;
  const start = new Date(`${taipeiDateIso()}T00:00:00.000Z`);
  start.setUTCDate(start.getUTCDate() - 7);
  const end = new Date(start);
  end.setUTCFullYear(end.getUTCFullYear() + 1);
  const [attendances, schools] = await withDatabaseRetry(() => Promise.all([
    prisma.attendance.findMany({
      where: { date: { gte: start, lt: end }, cancelled: false, course: { isActive: true } },
      include: {
        course: { include: { schoolRel: true } },
        actualTeacher: { select: { id: true, name: true } },
      },
      orderBy: [{ date: "asc" }, { course: { school: "asc" } }],
    }),
    prisma.school.findMany({ orderBy: [{ region: "asc" }, { name: "asc" }] }),
  ]));
  return NextResponse.json({
    attendances: attendances.map((item) => ({
      id: item.id,
      courseId: item.courseId,
      date: item.date.toISOString().slice(0, 10),
      time: item.scheduledTime?.trim() || item.course.time,
      schoolId: item.scheduledSchoolId ?? item.course.schoolId,
      school: item.scheduledSchoolName.trim() || item.course.school,
      address: item.scheduledAddress.trim() || item.course.address || item.course.schoolRel?.address || "",
      location: item.scheduledLocation.trim() || item.course.location || "",
      courseType: item.course.courseType,
      teacherId: item.actualTeacherId,
      teacherName: item.actualTeacher.name,
      isPayrollLocked: item.isPayrollLocked,
      completed: attendanceHasCompletionData(item),
    })),
    schools: schools.map((school) => ({ id: school.id, name: school.name, region: school.region, address: school.address, type: school.type })),
  });
}
