import { requiresStudentCount } from "@/lib/courseMeta";

export const REPORT_FILL_WINDOW_HOURS = 48;
export const REPORT_LINK_EXPIRED_MESSAGE = "此回報連結已過期，請聯繫客服";
export const REPORT_NOT_STARTED_MESSAGE = "課程尚未結束，請於下課後再進行回報";

type ReportAttendanceLike = {
  date: Date | string;
  category?: string | null;
  course?: object | null;
  hours?: number | null;
  studentCount?: number | null;
  studentCountA?: number | null;
  studentCountB?: number | null;
  reportContent?: string | null;
  cancelled?: boolean | null;
};

function reportCategory(attendance: ReportAttendanceLike) {
  // 課程主檔是目前行政設定；Attendance.category 可能是建立出勤時留下的舊值。
  const courseCategory = (attendance.course as { category?: string | null } | null | undefined)?.category;
  return courseCategory?.trim() || attendance.category;
}

function isoDate(value: Date | string) {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}

function taipeiLocalDate(iso: string, hour: number, minute: number) {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, hour - 8, minute));
}

function parsedTimes(timeText: string) {
  return [...timeText.matchAll(/(\d{1,2})[:：](\d{2})/g)]
    .map((match) => ({ hour: Number(match[1]), minute: Number(match[2]) }))
    .filter((time) => time.hour >= 0 && time.hour <= 23 && time.minute >= 0 && time.minute <= 59);
}

export function courseEndAt(attendance: ReportAttendanceLike, timeText = "") {
  const iso = isoDate(attendance.date);
  const times = parsedTimes(timeText);
  const rawHours = Number(attendance.hours ?? 0);
  const hours = Number.isFinite(rawHours) && rawHours > 0 ? rawHours : 0;

  if (times.length >= 2) {
    const end = taipeiLocalDate(iso, times[times.length - 1].hour, times[times.length - 1].minute);
    const start = taipeiLocalDate(iso, times[0].hour, times[0].minute);
    if (end <= start) end.setUTCDate(end.getUTCDate() + 1);
    return end;
  }

  if (times.length === 1) {
    const end = taipeiLocalDate(iso, times[0].hour, times[0].minute);
    end.setMinutes(end.getMinutes() + hours * 60);
    return end;
  }

  return taipeiLocalDate(iso, 23, 59);
}

export function reportExpiresAt(attendance: ReportAttendanceLike, timeText = "") {
  return new Date(courseEndAt(attendance, timeText).getTime() + REPORT_FILL_WINDOW_HOURS * 60 * 60 * 1000);
}

export function hasAttendanceCount(attendance: ReportAttendanceLike) {
  return attendance.studentCount != null || attendance.studentCountA != null || attendance.studentCountB != null;
}

export function isAttendanceReportComplete(attendance: ReportAttendanceLike, timeText = "", now = new Date()) {
  if (attendance.cancelled) return true;
  // 課還沒下課就不可能「出課完成」。未來課程上先填的人數（含 0）屬排課作業，
  // 不是實際到課紀錄；若當成已完成，這堂課會從待回報名單消失，老師也收不到回報提醒。
  if (now < courseEndAt(attendance, timeText)) return false;
  const reportText = (attendance.reportContent ?? "").trim();
  // 「正常上課」只是出勤狀態，不是課程進度。
  const hasReport = Boolean(reportText && reportText !== "正常上課");
  if (!requiresStudentCount(reportCategory(attendance))) return hasReport;
  // 課後課 / 營隊的行政必要回報是實際出席人數。
  return hasAttendanceCount(attendance);
}

export function attendanceReportWindow(attendance: ReportAttendanceLike, timeText = "", now = new Date()) {
  const complete = isAttendanceReportComplete(attendance, timeText, now);
  const endedAt = courseEndAt(attendance, timeText);
  const expiresAt = reportExpiresAt(attendance, timeText);
  const expired = now > expiresAt;
  const ended = now >= endedAt;
  const fillable = !attendance.cancelled && !complete && ended && !expired;

  return {
    complete,
    ended,
    fillable,
    expired,
    endedAt,
    expiresAt,
    status: complete
      ? "出課完成"
      : fillable ? "補填中（48小時內）" : expired && !complete ? "已逾期" : "",
  };
}

export function attendanceMissingItems(attendance: ReportAttendanceLike, timeText = "", now = new Date()) {
  if (attendance.cancelled) return [];

  const window = attendanceReportWindow(attendance, timeText, now);
  if (!window.fillable) return [];
  if (requiresStudentCount(reportCategory(attendance))) {
    return !hasAttendanceCount(attendance) ? ["缺出席人數"] : [];
  }
  const reportText = (attendance.reportContent ?? "").trim();
  return !reportText || reportText === "正常上課" ? ["缺課程進度"] : [];
}

export function isPendingReport(attendance: ReportAttendanceLike, timeText = "", now = new Date()) {
  return attendanceMissingItems(attendance, timeText, now).length > 0;
}
