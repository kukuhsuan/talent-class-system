import { calculateCourseHours, payableCourseHours } from "@/lib/courseHours";
import { resolvePayrollHours } from "@/lib/payrollHoursCore";

export type SalaryHoursResult = ReturnType<typeof calculateCourseHours>;

export function parseSalaryHours(rawTime: string | null | undefined) {
  return calculateCourseHours(rawTime);
}

export function salaryHoursFromTime(rawTime: string | null | undefined) {
  return payableCourseHours(rawTime);
}

export function salaryHoursFromValues(
  attendanceHours: unknown,
  coursePayrollHours: unknown,
  rawTime: string | null | undefined,
) {
  const resolved = resolvePayrollHours(attendanceHours, coursePayrollHours, rawTime);
  return {
    hours: resolved.payableHours,
    payableHours: resolved.payableHours,
    needsReview: resolved.needsReview,
    reason: resolved.reason,
    time: resolved.time,
    source: resolved.source,
  };
}
