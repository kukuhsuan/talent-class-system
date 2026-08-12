import { prisma } from "@/lib/prisma";
import { parseAttendanceDay } from "@/lib/attendanceBatch";

type TimeRange = { start: number; end: number };

export type CourseScheduleConflict = {
  date: string;
  teacherName: string;
  teacherRole: "主教" | "助教";
  existingRole: "主教" | "助教";
  courseCode: string;
  school: string;
  courseType: string;
  department: string;
  time: string;
};

/**
 * 支援一般時段與連續多段時段，例如：
 * 09:00-10:30、09:00-10:30/10:30-12:00。
 */
export function parseCourseTimeRanges(value: string | null | undefined): TimeRange[] {
  const normalized = String(value ?? "")
    .replace(/[：]/g, ":")
    .replace(/[－–—～~]/g, "-")
    .replace(/至|到/g, "-");
  const ranges: TimeRange[] = [];
  const pattern = /(\d{1,2})\s*:\s*(\d{2})\s*-\s*(\d{1,2})\s*:\s*(\d{2})/g;
  for (const match of normalized.matchAll(pattern)) {
    const startHour = Number(match[1]);
    const startMinute = Number(match[2]);
    const endHour = Number(match[3]);
    const endMinute = Number(match[4]);
    if (
      startHour > 23 || endHour > 23
      || startMinute > 59 || endMinute > 59
    ) continue;
    const start = startHour * 60 + startMinute;
    const end = endHour * 60 + endMinute;
    if (end > start) ranges.push({ start, end });
  }
  return ranges;
}

export function courseTimesOverlap(left: string, right: string) {
  const leftRanges = parseCourseTimeRanges(left);
  const rightRanges = parseCourseTimeRanges(right);
  return leftRanges.some((a) => rightRanges.some((b) => a.start < b.end && b.start < a.end));
}

function uniqueTeacherIds(teacherId: number, assistantTeacherId?: number | null) {
  return [...new Set([teacherId, assistantTeacherId]
    .filter((id): id is number => Number.isInteger(id) && Number(id) > 0))];
}

export async function findCourseScheduleConflict(input: {
  dates: string[];
  time: string;
  teacherId: number;
  assistantTeacherId?: number | null;
  excludeCourseId?: number;
}): Promise<CourseScheduleConflict | null> {
  const dates = [...new Set(input.dates.map((date) => date.trim().slice(0, 10)).filter(Boolean))];
  const teacherIds = uniqueTeacherIds(input.teacherId, input.assistantTeacherId);
  if (dates.length === 0 || teacherIds.length === 0 || parseCourseTimeRanges(input.time).length === 0) return null;

  const attendances = await prisma.attendance.findMany({
    where: {
      date: { in: dates.map(parseAttendanceDay) },
      cancelled: false,
      course: {
        isActive: true,
        ...(input.excludeCourseId ? { id: { not: input.excludeCourseId } } : {}),
      },
      OR: [
        { actualTeacherId: { in: teacherIds } },
        { assistantTeacherId: { in: teacherIds } },
      ],
    },
    select: {
      date: true,
      scheduledTime: true,
      actualTeacherId: true,
      assistantTeacherId: true,
      actualTeacher: { select: { id: true, name: true } },
      assistantTeacher: { select: { id: true, name: true } },
      course: {
        select: {
          code: true,
          school: true,
          courseType: true,
          department: true,
          time: true,
        },
      },
    },
    orderBy: [{ date: "asc" }, { id: "asc" }],
  });

  for (const attendance of attendances) {
    const existingTime = String(attendance.scheduledTime || attendance.course.time || "").trim();
    if (!courseTimesOverlap(input.time, existingTime)) continue;
    const sharedTeacherId = teacherIds.find((id) => (
      attendance.actualTeacherId === id || attendance.assistantTeacherId === id
    ));
    if (!sharedTeacherId) continue;
    const candidateIsAssistant = input.assistantTeacherId === sharedTeacherId;
    const existingIsAssistant = attendance.assistantTeacherId === sharedTeacherId;
    const existingTeacher = existingIsAssistant ? attendance.assistantTeacher : attendance.actualTeacher;
    return {
      date: attendance.date.toISOString().slice(0, 10),
      teacherName: existingTeacher?.name || `老師 #${sharedTeacherId}`,
      teacherRole: candidateIsAssistant ? "助教" : "主教",
      existingRole: existingIsAssistant ? "助教" : "主教",
      courseCode: attendance.course.code,
      school: attendance.course.school,
      courseType: attendance.course.courseType,
      department: attendance.course.department,
      time: existingTime,
    };
  }
  return null;
}

export function courseScheduleConflictMessage(conflict: CourseScheduleConflict) {
  const date = conflict.date.replace(/-/g, "/");
  const department = conflict.department ? `・${conflict.department}` : "";
  return `排課衝突：${conflict.teacherName}老師（本課${conflict.teacherRole}）在 ${date} ${conflict.time} 已擔任「${conflict.school}｜${conflict.courseType}」（${conflict.courseCode}${department}）${conflict.existingRole}。請調整日期、時間或老師後再儲存。`;
}
