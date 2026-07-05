import { prisma } from "@/lib/prisma";
export { coursePayrollHoursForAttendance, estimatedPayrollHoursFromTime, parsePayrollHours, resolvePayrollHours } from "@/lib/payrollHoursCore";
import { parsePayrollHours as parsePayrollHoursValue } from "@/lib/payrollHoursCore";

let coursePayrollColumnReady = false;

export async function ensureCoursePayrollHoursColumn() {
  if (coursePayrollColumnReady) return;

  const columns = await prisma.$queryRawUnsafe<Array<{ name: string }>>('PRAGMA table_info("Course")');
  if (!columns.some((column) => column.name === "payrollHours")) {
    await prisma.$executeRawUnsafe('ALTER TABLE "Course" ADD COLUMN "payrollHours" REAL').catch(() => undefined);
  }

  coursePayrollColumnReady = true;
}

export async function setCoursePayrollHours(courseId: number, payrollHours: unknown) {
  await ensureCoursePayrollHoursColumn();
  await prisma.$executeRawUnsafe(
    'UPDATE "Course" SET "payrollHours" = ? WHERE "id" = ?',
    parsePayrollHoursValue(payrollHours),
    courseId,
  );
}

export async function coursePayrollHoursMap(courseIds: number[]) {
  const ids = [...new Set(courseIds.filter((id) => Number.isFinite(id)))];
  if (ids.length === 0) return new Map<number, number | null>();

  await ensureCoursePayrollHoursColumn();
  const placeholders = ids.map(() => "?").join(",");
  const rows = await prisma.$queryRawUnsafe<Array<{ id: number; payrollHours: number | null }>>(
    `SELECT "id", "payrollHours" FROM "Course" WHERE "id" IN (${placeholders})`,
    ...ids,
  );
  return new Map(rows.map((row) => [Number(row.id), row.payrollHours == null ? null : Number(row.payrollHours)]));
}
