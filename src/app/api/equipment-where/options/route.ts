import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { BACKOFFICE_ROLES, requireRole } from "@/lib/permissions";

export async function GET() {
  const auth = await requireRole(BACKOFFICE_ROLES);
  if (auth.response) return auth.response;

  const today = new Date();
  const from = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate() - 30));
  const to = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate() + 120));
  const [teachers, schools, attendances] = await Promise.all([
    prisma.teacher.findMany({
      select: { id: true, name: true, phone: true, lineUserId: true, lineRegion: true },
      orderBy: { name: "asc" },
    }),
    prisma.school.findMany({
      select: { id: true, name: true, type: true, region: true, address: true },
      orderBy: [{ region: "asc" }, { name: "asc" }],
    }),
    prisma.attendance.findMany({
      where: { date: { gte: from, lte: to } },
      select: {
        id: true,
        date: true,
        scheduledTime: true,
        actualTeacher: { select: { id: true, name: true, phone: true } },
        course: {
          select: {
            id: true,
            code: true,
            school: true,
            courseType: true,
            address: true,
            time: true,
            schoolRel: { select: { name: true, address: true } },
          },
        },
      },
      orderBy: [{ date: "asc" }],
      take: 500,
    }),
  ]);

  return NextResponse.json({
    teachers,
    schools,
    attendances: attendances.map((row) => ({
      id: row.id,
      date: row.date.toISOString().slice(0, 10),
      courseTime: row.scheduledTime || row.course.time || "",
      courseId: row.course.id,
      courseCode: row.course.code,
      courseName: row.course.courseType,
      schoolName: row.course.schoolRel?.name || row.course.school,
      schoolAddress: row.course.schoolRel?.address || row.course.address,
      teacherId: row.actualTeacher.id,
      teacherName: row.actualTeacher.name,
      teacherPhone: row.actualTeacher.phone,
    })),
  });
}
