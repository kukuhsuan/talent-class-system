import { prisma } from "@/lib/prisma";
import { attendanceScheduledTimeMap, effectiveAttendanceTime } from "@/lib/attendanceTime";
import { normalizeRegion } from "@/lib/courseMeta";
import { buildSubstituteInquiryMessage, getLineConfig, pushMessage } from "@/lib/line";
import type { LineRegion } from "@/lib/line";
import { LEAVE_STATUS, splitTimeRange, upsertSubstituteInquiry, type TeacherLeaveListItem } from "@/lib/teacherLeaves";
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

export const AUTO_INQUIRY_LIMIT = 5;

/**
 * 依「地區＋專長」自動挑選代課候選人並發送 LINE 詢問。
 * 規則：排除原請假老師、未綁定 LINE、當日時段衝堂或前後少於 30 分鐘交通緩衝者；
 * 優先詢問地區或專長相符者，若無相符者則退回綜合分數最高者。
 */
export async function autoSendSubstituteInquiries(leave: TeacherLeaveListItem, limit = AUTO_INQUIRY_LIMIT) {
  if (leave.isPayrollLocked) return { sent: 0, skipped: 0, asked: [] as string[], reason: "課程已鎖定薪資" };
  const { items } = await listSubstituteCandidates(leave);
  const eligible = items.filter((c) => c.hasLineBinding && !c.hasConflict && !c.isOriginalTeacher);
  const matched = eligible.filter((c) => c.regionMatch || c.specialtyMatch);
  const picked = (matched.length > 0 ? matched : eligible).slice(0, limit);
  if (picked.length === 0) return { sent: 0, skipped: 0, asked: [] as string[], reason: "沒有可詢問的代課老師" };

  const sendResults = await Promise.allSettled(picked.map(async (candidate) => {
    const inquiryId = await upsertSubstituteInquiry(leave.id, leave.attendanceId, candidate.id);
    const msg = buildSubstituteInquiryMessage({
      inquiryId,
      date: leave.leaveDate,
      time: leave.time,
      school: leave.school,
      courseType: leave.courseType,
      address: leave.address,
    });
    await pushMessage(candidate.lineUserId!, [msg], getLineConfig(candidate.lineRegion as LineRegion).token);
    return candidate.name;
  }));

  const asked: string[] = [];
  let skipped = 0;
  for (const result of sendResults) {
    if (result.status === "fulfilled") asked.push(result.value);
    else skipped++;
  }

  if (asked.length > 0) {
    await prisma.$executeRawUnsafe(
      `UPDATE "TeacherLeaveRequest" SET "status" = ?, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = ?`,
      LEAVE_STATUS.searching,
      leave.id,
    );
  }

  return { sent: asked.length, skipped, asked, reason: "" };
}
