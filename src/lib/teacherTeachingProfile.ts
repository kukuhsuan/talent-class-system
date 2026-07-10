import type { PrismaClient } from "@prisma/client";
import { courseLabel, normalizeRegion } from "@/lib/courseMeta";

export type TeacherSpecialty = "舞蹈" | "運動" | "";

export type TeacherTeachingProfile = {
  teacherId: number;
  primaryRegion: string;
  primaryRegionLabel: string;
  primarySpecialty: TeacherSpecialty | "舞蹈 / 運動" | "";
  primarySpecialtyLabel: string;
  recentAttendanceCount: number;
  primaryCourseTypes: string[];
  hasTeachingRecords: boolean;
};

type CourseSnapshot = {
  region: string | null;
  courseType: string;
  schoolRel?: { region: string | null } | null;
};

type ProfileAccumulator = {
  attendanceCount: number;
  fallbackCourseCount: number;
  regionCounts: Map<string, number>;
  specialtyCounts: Map<TeacherSpecialty, number>;
  courseTypeCounts: Map<string, number>;
};

const DANCE_KEYWORDS = ["舞蹈", "MV舞蹈", "MV", "律動", "街舞", "HipHop", "hiphop", "HIPHOP"];
const SPORTS_KEYWORDS = ["足球", "籃球", "棒球", "樂樂棒球", "高爾夫", "冰壺", "體能", "體適能", "橄欖球", "桌球", "匹克球", "運動"];

function emptyAccumulator(): ProfileAccumulator {
  return {
    attendanceCount: 0,
    fallbackCourseCount: 0,
    regionCounts: new Map(),
    specialtyCounts: new Map(),
    courseTypeCounts: new Map(),
  };
}

function addCount(map: Map<string, number>, key: string, amount = 1) {
  const trimmed = key.trim();
  if (!trimmed) return;
  map.set(trimmed, (map.get(trimmed) ?? 0) + amount);
}

function addSpecialtyCount(map: Map<TeacherSpecialty, number>, key: TeacherSpecialty, amount = 1) {
  if (!key) return;
  map.set(key, (map.get(key) ?? 0) + amount);
}

export function teachingRegionLabel(region: string) {
  const normalized = normalizeRegion(region);
  if (!normalized) return "";
  const compact = normalized.replace(/[市縣]$/, "");
  return `${compact}區`;
}

export function inferCourseSpecialty(courseType: string | null | undefined): TeacherSpecialty {
  const label = courseLabel(courseType ?? "");
  if (!label) return "";
  if (DANCE_KEYWORDS.some((keyword) => label.includes(keyword))) return "舞蹈";
  if (SPORTS_KEYWORDS.some((keyword) => label.includes(keyword))) return "運動";
  return "";
}

function courseRegion(course: CourseSnapshot) {
  return normalizeRegion(course.region || course.schoolRel?.region || "");
}

function sortedCounts<T extends string>(map: Map<T, number>) {
  return [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "zh-Hant"));
}

function primaryFromCounts<T extends string>(map: Map<T, number>, formatter: (value: T) => string = (value) => value) {
  const rows = sortedCounts(map);
  const first = rows[0];
  if (!first) return "";
  const second = rows[1];
  if (second && second[1] >= first[1] * 0.7) return `${formatter(first[0])} / ${formatter(second[0])}`;
  return formatter(first[0]);
}

function addCourseToProfile(profile: ProfileAccumulator, course: CourseSnapshot, options: { attendance: boolean }) {
  if (options.attendance) profile.attendanceCount += 1;
  else profile.fallbackCourseCount += 1;
  addCount(profile.regionCounts, courseRegion(course));
  const label = courseLabel(course.courseType);
  addCount(profile.courseTypeCounts, label || course.courseType);
  addSpecialtyCount(profile.specialtyCounts, inferCourseSpecialty(course.courseType));
}

function finalizeProfile(teacherId: number, profile: ProfileAccumulator): TeacherTeachingProfile {
  const primaryRegion = primaryFromCounts(profile.regionCounts, teachingRegionLabel);
  const primarySpecialty = primaryFromCounts(profile.specialtyCounts) as TeacherTeachingProfile["primarySpecialty"];
  const primaryCourseTypes = sortedCounts(profile.courseTypeCounts).slice(0, 3).map(([course]) => course);
  const hasTeachingRecords = profile.attendanceCount > 0 || profile.fallbackCourseCount > 0;
  return {
    teacherId,
    primaryRegion,
    primaryRegionLabel: !hasTeachingRecords ? "尚無排課紀錄" : primaryRegion ? `${primaryRegion}老師` : "區域未判斷",
    primarySpecialty,
    primarySpecialtyLabel: !hasTeachingRecords ? "尚無排課紀錄" : primarySpecialty ? `專長：${primarySpecialty}` : "專長未判斷",
    recentAttendanceCount: profile.attendanceCount,
    primaryCourseTypes,
    hasTeachingRecords,
  };
}

export function rankTeacherForSubstitute(
  profile: TeacherTeachingProfile,
  target: { region: string; specialty: TeacherSpecialty },
  flags: { hasConflict: boolean; hasLineBinding: boolean; isOriginalTeacher: boolean },
) {
  let score = 0;
  if (flags.isOriginalTeacher) score -= 1000;
  if (!flags.hasLineBinding) score -= 200;
  if (flags.hasConflict) score -= 100;
  if (target.region && profile.primaryRegion.includes(teachingRegionLabel(target.region))) score += 80;
  if (target.specialty && profile.primarySpecialty.includes(target.specialty)) score += 60;
  if (profile.primaryCourseTypes.length > 0) score += 10;
  score += Math.min(profile.recentAttendanceCount, 20);
  return score;
}

export async function teacherTeachingProfiles(
  prisma: PrismaClient,
  teacherIds: number[],
  options: { now?: Date; days?: number } = {},
) {
  const uniqueIds = [...new Set(teacherIds.filter((id) => Number.isFinite(id)))];
  const profiles = new Map(uniqueIds.map((id) => [id, emptyAccumulator()]));
  if (uniqueIds.length === 0) return new Map<number, TeacherTeachingProfile>();

  const now = options.now ?? new Date();
  const days = options.days ?? 90;
  const since = new Date(now);
  since.setUTCDate(since.getUTCDate() - days);

  const attendances = await prisma.attendance.findMany({
    where: {
      date: { gte: since },
      cancelled: false,
      OR: [
        { actualTeacherId: { in: uniqueIds } },
        { assistantTeacherId: { in: uniqueIds } },
      ],
    },
    select: {
      actualTeacherId: true,
      assistantTeacherId: true,
      course: { select: { region: true, courseType: true, schoolRel: { select: { region: true } } } },
    },
  });

  for (const row of attendances) {
    const actual = profiles.get(row.actualTeacherId);
    if (actual) addCourseToProfile(actual, row.course, { attendance: true });
    if (row.assistantTeacherId && row.assistantTeacherId !== row.actualTeacherId) {
      const assistant = profiles.get(row.assistantTeacherId);
      if (assistant) addCourseToProfile(assistant, row.course, { attendance: true });
    }
  }

  const missingIds = uniqueIds.filter((id) => (profiles.get(id)?.attendanceCount ?? 0) === 0);
  if (missingIds.length > 0) {
    const courses = await prisma.course.findMany({
      where: {
        isActive: true,
        OR: [
          { teacherId: { in: missingIds } },
          { assistantTeacherId: { in: missingIds } },
        ],
      },
      select: {
        teacherId: true,
        assistantTeacherId: true,
        region: true,
        courseType: true,
        schoolRel: { select: { region: true } },
      },
    });
    for (const row of courses) {
      const actual = profiles.get(row.teacherId);
      if (actual && actual.attendanceCount === 0) addCourseToProfile(actual, row, { attendance: false });
      if (row.assistantTeacherId && row.assistantTeacherId !== row.teacherId) {
        const assistant = profiles.get(row.assistantTeacherId);
        if (assistant && assistant.attendanceCount === 0) addCourseToProfile(assistant, row, { attendance: false });
      }
    }
  }

  return new Map(uniqueIds.map((id) => [id, finalizeProfile(id, profiles.get(id) ?? emptyAccumulator())]));
}
