export type ScheduleMonth = { year: number; monthIndex: number };

/** 課表只開放目前月份到當期結束；每跨月自動移除上一月。 */
export function activeScheduleMonths(todayIso: string): ScheduleMonth[] {
  const [year, month] = todayIso.split("-").map(Number);
  const endMonth = month >= 9 || month === 1 ? 1 : month <= 6 ? 6 : 8;
  const endYear = month >= 9 ? year + 1 : year;
  const result: ScheduleMonth[] = [];
  let cursorYear = year;
  let cursorMonth = month;
  while (cursorYear < endYear || (cursorYear === endYear && cursorMonth <= endMonth)) {
    result.push({ year: cursorYear, monthIndex: cursorMonth - 1 });
    cursorMonth += 1;
    if (cursorMonth === 13) {
      cursorMonth = 1;
      cursorYear += 1;
    }
  }
  return result;
}
