export type CourseHoursResult = {
  hours: number | null;
  needsReview: boolean;
  reason: string;
  time: string;
};

function padTimePart(value: number) {
  return String(value).padStart(2, "0");
}

export function calculateCourseHours(rawTime: string | null | undefined): CourseHoursResult {
  const original = String(rawTime ?? "").trim();
  if (!original) {
    return { hours: null, needsReview: true, reason: "上課時間空白", time: "" };
  }

  const compact = original
    .replace(/[－–—]/g, "-")
    .replace(/[～~]/g, "-")
    .replace(/至|到/g, "-")
    .replace(/：/g, ":")
    .replace(/\s+/g, "");

  const match = compact.match(/^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/);
  if (!match) {
    return {
      hours: null,
      needsReview: true,
      reason: "時間格式不完整或不是單一起訖時間",
      time: original,
    };
  }

  const startHour = Number(match[1]);
  const startMinute = Number(match[2]);
  const endHour = Number(match[3]);
  const endMinute = Number(match[4]);

  if (
    startHour > 23 ||
    endHour > 23 ||
    startMinute > 59 ||
    endMinute > 59
  ) {
    return { hours: null, needsReview: true, reason: "時間數字超出範圍", time: original };
  }

  const start = startHour * 60 + startMinute;
  const end = endHour * 60 + endMinute;
  if (end <= start) {
    return { hours: null, needsReview: true, reason: "結束時間早於或等於開始時間", time: original };
  }

  const hours = Math.round(((end - start) / 60) * 100) / 100;
  return {
    hours,
    needsReview: false,
    reason: "",
    time: `${padTimePart(startHour)}:${padTimePart(startMinute)}-${padTimePart(endHour)}:${padTimePart(endMinute)}`,
  };
}

export function payableCourseHours(rawTime: string | null | undefined) {
  const parsed = calculateCourseHours(rawTime);
  return {
    ...parsed,
    payableHours: parsed.hours ?? 0,
  };
}

export function attendanceHoursFromCourseTime(rawTime: string | null | undefined) {
  const parsed = calculateCourseHours(rawTime);
  return {
    hours: parsed.hours ?? 0,
    needsReview: parsed.needsReview,
    reason: parsed.reason,
    time: parsed.time,
  };
}
