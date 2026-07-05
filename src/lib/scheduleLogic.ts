import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { expandIsoDateRange, utcStartOfIsoDay, utcStartOfNextIsoDay, weekdayOfIso } from "@/lib/courseDates";

export function dayBounds(iso: string) {
  return { start: utcStartOfIsoDay(iso), end: utcStartOfNextIsoDay(iso) };
}

export function dayNameOfIso(iso: string) {
  return weekdayOfIso(iso);
}

type CourseDateWindow = {
  startDate?: Date | string | null;
  endDate?: Date | string | null;
};

function dateOnlyTime(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return utcStartOfIsoDay(date.toISOString().slice(0, 10)).getTime();
}

export function courseDateWindowWhere(targetIso: string): Prisma.CourseWhereInput {
  const targetStart = utcStartOfIsoDay(targetIso);
  return {
    AND: [
      { OR: [{ startDate: null }, { startDate: { lte: targetStart } }] },
      { OR: [{ endDate: null }, { endDate: { gte: targetStart } }] },
    ],
  };
}

export function courseOccursOnIso(course: CourseDateWindow, targetIso: string) {
  const target = utcStartOfIsoDay(targetIso).getTime();
  const start = dateOnlyTime(course.startDate);
  const end = dateOnlyTime(course.endDate);
  return (start === null || start <= target) && (end === null || end >= target);
}

// Returns IDs of courses that have at least one attendance record.
// Uses EXISTS (course → attendances: some) instead of a full DISTINCT scan on Attendance.
// nearDate: when provided, only considers attendance within ±180 days — avoids scanning
// historical records while still covering all active/upcoming courses.
export async function courseIdsWithAnyAttendance(
  courseWhere: Prisma.CourseWhereInput = {},
  nearDate?: Date,
) {
  const dateFilter: Prisma.AttendanceWhereInput = nearDate
    ? {
        date: {
          gte: new Date(nearDate.getTime() - 180 * 24 * 60 * 60 * 1000),
          lte: new Date(nearDate.getTime() + 180 * 24 * 60 * 60 * 1000),
        },
      }
    : {};

  const rows = await prisma.course.findMany({
    where: {
      ...courseWhere,
      attendances: { some: { ...dateFilter } },
    },
    select: { id: true },
  });
  return new Set(rows.map((row) => row.id));
}

export function isoDatesBetween(fromIso: string, toIso: string) {
  return expandIsoDateRange(fromIso, toIso);
}
