// 自 2026-10-27 起改為人工通知老師上課：系統不再以 LINE 發送老師課程提醒。
// 判斷依據是「上課日期」：10/26（含）以前的課照常提醒，10/27 起的課一律不發。
export const TEACHER_REMINDER_LAST_CLASS_DATE = "2026-10-26";
export const TEACHER_REMINDER_STOPPED_MESSAGE = "自 10/27 起改為人工通知老師上課，系統不再發送 LINE 課程提醒。";

export function teacherReminderStopped(classDateIso: string) {
  return classDateIso.slice(0, 10) > TEACHER_REMINDER_LAST_CLASS_DATE;
}

// 課前交辦、到課提醒、回報提醒、課前會議提醒：自 10/27 起一律不再以 LINE 通知老師。
export const TEACHER_LINE_STOPPED_MESSAGE = "自 10/27 起改為人工通知老師，系統不再發送 LINE 通知給老師。";

export function teacherLineNotificationsStopped(todayIso: string) {
  return todayIso.slice(0, 10) > TEACHER_REMINDER_LAST_CLASS_DATE;
}
