import { attendanceHoursFromCourseTime, calculateCourseHours } from "@/lib/courseHours";

export type PayrollHoursResult = {
  payableHours: number;
  needsReview: boolean;
  reason: string;
  time: string;
  source: "manual" | "course" | "estimated" | "review";
};

export function parsePayrollHours(value: unknown) {
  if (value === "" || value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

export function resolvePayrollHours(
  attendanceHours: unknown,
  coursePayrollHours: unknown,
  courseTime: string | null | undefined,
): PayrollHoursResult {
  const courseManual = parsePayrollHours(coursePayrollHours);
  if (courseManual !== null) {
    return { payableHours: courseManual, needsReview: false, reason: "", time: courseTime ?? "", source: "course" };
  }

  const manual = parsePayrollHours(attendanceHours);
  if (manual !== null) {
    return { payableHours: manual, needsReview: false, reason: "", time: courseTime ?? "", source: "manual" };
  }

  const estimated = calculateCourseHours(courseTime);
  return {
    payableHours: estimated.hours ?? 0,
    needsReview: estimated.needsReview,
    reason: estimated.reason,
    time: estimated.time || String(courseTime ?? ""),
    source: estimated.needsReview ? "review" : "estimated",
  };
}

export function coursePayrollHoursForAttendance(coursePayrollHours: unknown, courseTime: string | null | undefined) {
  const resolved = resolvePayrollHours(null, coursePayrollHours, courseTime);
  return {
    hours: resolved.payableHours,
    needsReview: resolved.needsReview,
    reason: resolved.reason,
    time: resolved.time,
  };
}

export function estimatedPayrollHoursFromTime(courseTime: string | null | undefined) {
  return attendanceHoursFromCourseTime(courseTime);
}
