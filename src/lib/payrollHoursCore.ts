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
  // 這一堂的時數是行政在出勤頁人工改過的（見 src/lib/attendanceHoursOverride.ts）。
  // 預設 false：沒有標記的資料維持「課程預設優先」的舊行為，不動到歷史薪資。
  hoursOverridden = false,
): PayrollHoursResult {
  const manual = parsePayrollHours(attendanceHours);
  // 人工覆蓋是「例外壓過通則」：行政特地為這一堂填的數字，必須蓋過整學期的課程預設，
  // 否則畫面顯示改成功、薪資卻沒變，是最難察覺的錯帳。
  if (hoursOverridden && manual !== null) {
    return { payableHours: manual, needsReview: false, reason: "", time: courseTime ?? "", source: "manual" };
  }

  const courseManual = parsePayrollHours(coursePayrollHours);
  if (courseManual !== null) {
    return { payableHours: courseManual, needsReview: false, reason: "", time: courseTime ?? "", source: "course" };
  }

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
