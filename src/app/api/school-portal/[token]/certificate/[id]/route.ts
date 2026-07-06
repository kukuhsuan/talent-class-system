import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveSchoolPortalParam } from "@/lib/schoolPortalAccess";

export async function GET(_req: Request, { params }: { params: Promise<{ token: string; id: string }> }) {
  try {
    const { token, id } = await params;
    const { schoolId } = await resolveSchoolPortalParam(token);
    const assessment = await prisma.kindergartenAssessment.findUnique({
      where: { id: Number(id) },
      include: { attendance: { include: { course: true, actualTeacher: true } } },
    }) as unknown as {
      id: number; childName: string; courseName: string; scores: string; comment: string; title: string;
      attendance: { date: Date; actualTeacher: { name: string }; course: { schoolId: number | null; school: string; courseType: string } };
    } | null;

    if (!assessment || assessment.attendance.course.schoolId !== schoolId) {
      return NextResponse.json({ error: "找不到證書" }, { status: 404 });
    }

    return NextResponse.json({
      id: assessment.id,
      childName: assessment.childName,
      courseName: assessment.courseName || assessment.attendance.course.courseType,
      school: assessment.attendance.course.school,
      teacherName: assessment.attendance.actualTeacher.name,
      date: assessment.attendance.date,
      scores: assessment.scores,
      comment: assessment.comment,
      title: assessment.title,
    });
  } catch {
    return NextResponse.json({ error: "園所連結無效或已過期" }, { status: 401 });
  }
}
