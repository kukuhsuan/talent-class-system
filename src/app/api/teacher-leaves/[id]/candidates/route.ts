import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { attendanceScheduledTimeMap, effectiveAttendanceTime } from "@/lib/attendanceTime";
import { normalizeRegion } from "@/lib/courseMeta";
import { getTeacherLeave, splitTimeRange } from "@/lib/teacherLeaves";
import { inferCourseSpecialty, rankTeacherForSubstitute, teacherTeachingProfiles } from "@/lib/teacherTeachingProfile";

function toMinutes(time: string) {
  const match = time.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string) {
  const as = toMinutes(aStart);
  const ae = toMinutes(aEnd);
  const bs = toMinutes(bStart);
  const be = toMinutes(bEnd);
  if (as == null || ae == null || bs == null || be == null) return false;
  return as < be && ae > bs;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const leave = await getTeacherLeave(Number(id));
    if (!leave) return NextResponse.json({ error: "找不到請假申請" }, { status: 404 });

    const start = new Date(`${leave.leaveDate}T00:00:00.000Z`);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 1);
    const [teachers, sameDayAttendances, leaveCourse] = await Promise.all([
      prisma.teacher.findMany({ orderBy: { name: "asc" } }),
      prisma.attendance.findMany({
        where: { date: { gte: start, lt: end }, cancelled: false },
        include: { course: true },
      }),
      prisma.course.findUnique({
        where: { id: leave.courseId },
        select: { region: true, courseType: true, schoolRel: { select: { region: true } } },
      }),
    ]);
    const profiles = await teacherTeachingProfiles(prisma, teachers.map((teacher) => teacher.id));
    const timeMap = await attendanceScheduledTimeMap(sameDayAttendances.map((row) => row.id));
    const conflictTeacherIds = new Set<number>();
    for (const row of sameDayAttendances) {
      const time = effectiveAttendanceTime({
        scheduledTime: timeMap.get(row.id),
        courseTime: row.course.time,
        attendanceHours: row.hours,
        isPayrollLocked: row.isPayrollLocked,
        reportContent: row.reportContent,
        reportSentAt: row.reportSentAt,
        studentCount: row.studentCount,
        studentCountA: row.studentCountA,
        studentCountB: row.studentCountB,
      });
      const { startTime, endTime } = splitTimeRange(time);
      if (!overlaps(leave.startTime, leave.endTime, startTime, endTime)) continue;
      conflictTeacherIds.add(row.actualTeacherId);
      if (row.assistantTeacherId) conflictTeacherIds.add(row.assistantTeacherId);
    }

    const target = {
      region: normalizeRegion(leaveCourse?.region || leaveCourse?.schoolRel?.region || ""),
      specialty: inferCourseSpecialty(leaveCourse?.courseType || leave.courseType),
    };
    const items = teachers.map((teacher) => {
      const profile = profiles.get(teacher.id);
      const hasLineBinding = Boolean(teacher.lineUserId && teacher.lineRegion);
      const hasConflict = conflictTeacherIds.has(teacher.id);
      const isOriginalTeacher = teacher.id === leave.teacherId;
      const score = profile
        ? rankTeacherForSubstitute(profile, target, { hasConflict, hasLineBinding, isOriginalTeacher })
        : 0;
      return {
        id: teacher.id,
        name: teacher.name,
        lineUserId: teacher.lineUserId,
        lineRegion: teacher.lineRegion,
        region: profile?.primaryRegionLabel ?? "尚無排課紀錄",
        primaryRegion: profile?.primaryRegion ?? "",
        primaryRegionLabel: profile?.primaryRegionLabel ?? "尚無排課紀錄",
        primarySpecialty: profile?.primarySpecialty ?? "",
        primarySpecialtyLabel: profile?.primarySpecialtyLabel ?? "尚無排課紀錄",
        recentAttendanceCount: profile?.recentAttendanceCount ?? 0,
        primaryCourseTypes: profile?.primaryCourseTypes ?? [],
        hasTeachingRecords: Boolean(profile?.hasTeachingRecords),
        isOriginalTeacher,
        hasLineBinding,
        hasConflict,
        score,
      };
    }).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, "zh-Hant"));

    return NextResponse.json({ items, target });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message || "候選老師載入失敗" }, { status: 400 });
  }
}
