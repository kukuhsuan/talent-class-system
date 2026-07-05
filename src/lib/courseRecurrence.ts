import { parseAttendanceDay } from "@/lib/attendanceBatch";
import { weekdayOfIso } from "@/lib/courseDates";

const RECURRENCE_TYPES = new Set(["single", "multiple", "range", "weekly"]);

function optionalDate(value: unknown) {
  const iso = String(value ?? "").trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? parseAttendanceDay(iso) : null;
}

export function recurrenceFields(data: Record<string, unknown>, scheduledDates: string[]) {
  const recurrenceType = RECURRENCE_TYPES.has(String(data.dateMode ?? "")) ? String(data.dateMode) : "";
  const first = scheduledDates[0] ?? "";
  const last = scheduledDates[scheduledDates.length - 1] ?? "";
  const weeklyDays = Array.isArray(data.recurringDays)
    ? data.recurringDays.map(String).filter(Boolean)
    : [];
  const dateWeekdays = [...new Set(scheduledDates.map(weekdayOfIso).filter(Boolean))];

  return {
    recurrenceType,
    startDate: optionalDate(recurrenceType === "weekly" ? data.recurringStart : recurrenceType === "range" ? data.rangeStart : first),
    endDate: optionalDate(recurrenceType === "weekly" ? data.recurringEnd : recurrenceType === "range" ? data.rangeEnd : last),
    weekday: (recurrenceType === "weekly" ? weeklyDays : dateWeekdays).join(","),
  };
}
