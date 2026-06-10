import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { expandIsoDateRange, utcStartOfIsoDay, utcStartOfNextIsoDay, weekdayOfIso } from "@/lib/courseDates";

export function dayBounds(iso: string) {
  return { start: utcStartOfIsoDay(iso), end: utcStartOfNextIsoDay(iso) };
}

export function dayNameOfIso(iso: string) {
  return weekdayOfIso(iso);
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
