import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizeCategory } from "@/lib/courseMeta";

/** Parse YYYY-MM-DD to UTC midnight for consistent DB storage. */
export function parseAttendanceDay(dateStr: string): Date {
  return new Date(`${dateStr.trim()}T00:00:00.000Z`);
}

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export type AttendanceCreateFields = {
  courseId: number;
  actualTeacherId: number;
  assistantTeacherId?: number | null;
  studentCount?: number | null;
  cancelled?: boolean;
  cancelReason?: string;
  makeupDate?: Date | null;
  makeupDone?: boolean;
  category?: string;
  hours?: number;
  notes?: string;
};

/**
 * Creates one Attendance per calendar day; skips duplicates (same course + same calendar day).
 */
export async function createAttendancesForUniqueDays(
  dates: string[],
  fields: AttendanceCreateFields,
  db: Pick<PrismaClient, "attendance"> = prisma,
) {
  const unique = [...new Set(dates.map((d) => d.trim()).filter(Boolean))];
  if (unique.length === 0) return { created: 0, skipped: 0, records: [] };

  const min = parseAttendanceDay(unique.reduce((a, b) => (a < b ? a : b)));
  const max = parseAttendanceDay(unique.reduce((a, b) => (a > b ? a : b)));
  const maxEnd = new Date(max);
  maxEnd.setUTCDate(maxEnd.getUTCDate() + 1);

  const existing = await db.attendance.findMany({
    where: {
      courseId: fields.courseId,
      date: { gte: min, lt: maxEnd },
    },
    select: { date: true },
  });
  const existingKeys = new Set(existing.map((e) => dayKey(e.date)));

  const records = [];
  let skipped = 0;
  const createData = [];
  const createKeys = new Set<string>();
  for (const dateStr of unique) {
    if (existingKeys.has(dateStr)) {
      skipped++;
      continue;
    }
    createData.push({
      date: parseAttendanceDay(dateStr),
      courseId: fields.courseId,
      actualTeacherId: fields.actualTeacherId,
      assistantTeacherId: fields.assistantTeacherId ?? null,
      studentCount: fields.studentCount ?? null,
      cancelled: fields.cancelled ?? false,
      cancelReason: fields.cancelReason ?? "",
      makeupDate: fields.makeupDate ?? null,
      makeupDone: fields.makeupDone ?? false,
      category: normalizeCategory(fields.category),
      hours: fields.hours ?? 0,
      notes: fields.notes ?? "",
    });
    createKeys.add(dateStr);
    existingKeys.add(dateStr);
  }
  if (createData.length > 0) {
    await db.attendance.createMany({ data: createData });
    const createdRows = await db.attendance.findMany({
      where: {
        courseId: fields.courseId,
        date: { gte: min, lt: maxEnd },
      },
      include: { course: true, actualTeacher: true, assistantTeacher: true },
      orderBy: { date: "asc" },
    });
    records.push(...createdRows.filter((record) => createKeys.has(dayKey(record.date))));
  }
  return { created: records.length, skipped, records };
}
