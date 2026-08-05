import { prisma } from "@/lib/prisma";
import { attendanceScheduledTimeMap, effectiveAttendanceTime } from "@/lib/attendanceTime";
import { normalizeRegion } from "@/lib/courseMeta";
import { splitTimeRange, type TeacherLeaveListItem } from "@/lib/teacherLeaves";
import {
  inferCourseSpecialty,
  rankTeacherForSubstitute,
  teacherTeachingProfiles,
  teachingRegionLabel,
  type TeacherSpecialty,
} from "@/lib/teacherTeachingProfile";

export type SubstituteCandidate = {
  id: number;
  name: string;
  lineUserId: string | null;
  lineRegion: string | null;
  region: string;
  primaryRegion: string;
  primaryRegionLabel: string;
  primarySpecialty: string;
  primarySpecialtyLabel: string;
  recentAttendanceCount: number;
  primaryCourseTypes: string[];
  hasTeachingRecords: boolean;
  isOriginalTeacher: boolean;
  hasLineBinding: boolean;
  hasConflict: boolean;
  regionMatch: boolean;
  specialtyMatch: boolean;
  score: number;
};

export type SubstituteCandidateTarget = { region: string; specialty: TeacherSpecialty };

function toMinutes(time: string) {
  const match = time.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

export const SUBSTITUTE_TRAVEL_BUFFER_MINUTES = 30;

function overlapsOrTooClose(aStart: string, aEnd: string, bStart: string, bEnd: string, bufferMinutes = SUBSTITUTE_TRAVEL_BUFFER_MINUTES) {
  const as = toMinutes(aStart);
  const ae = toMinutes(aEnd);
  const bs = toMinutes(bStart);
  const be = toMinutes(bEnd);
  if (as == null || ae == null || bs == null || be == null) return false;
  // 除了實際重疊，也排除前後銜接不足交通緩衝時間的課程。
  // 例如既有課程 13:30-15:00、待代課 15:00-16:30，間隔為 0，應排除。
  return as < be + bufferMinutes && ae > bs - bufferMinutes;
}

export async function listSubstituteCandidates(leave: TeacherLeaveListItem): Promise<{ items: SubstituteCandidate[]; target: SubstituteCandidateTarget }> {
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
    if (!overlapsOrTooClose(leave.startTime, leave.endTime, startTime, endTime)) continue;
    conflictTeacherIds.add(row.actualTeacherId);
    if (row.assistantTeacherId) conflictTeacherIds.add(row.assistantTeacherId);
  }

  const target: SubstituteCandidateTarget = {
    region: normalizeRegion(leaveCourse?.region || leaveCourse?.schoolRel?.region || ""),
    specialty: inferCourseSpecialty(leaveCourse?.courseType || leave.courseType),
  };
  const items = teachers.map((teacher): SubstituteCandidate => {
    const profile = profiles.get(teacher.id);
    const hasLineBinding = Boolean(teacher.lineUserId && teacher.lineRegion);
    const hasConflict = conflictTeacherIds.has(teacher.id);
    const isOriginalTeacher = teacher.id === leave.teacherId;
    const score = profile
      ? rankTeacherForSubstitute(profile, target, { hasConflict, hasLineBinding, isOriginalTeacher })
      : 0;
    const regionMatch = Boolean(target.region && profile?.primaryRegion.includes(teachingRegionLabel(target.region)));
    const specialtyMatch = Boolean(target.specialty && profile?.primarySpecialty.includes(target.specialty));
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
      regionMatch,
      specialtyMatch,
      score,
    };
  }).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, "zh-Hant"));

  return { items, target };
}

// 這裡原本有一支 autoSendSubstituteInquiries，核准請假時自動挑最多 5 位老師群發詢問，
// 已整支移除。排序與標記（listSubstituteCandidates）留著——「選老師發詢問」的候選名單
// 就是靠它把地區、專長、衝堂算出來給行政參考，只是最後送給誰改由人決定。
