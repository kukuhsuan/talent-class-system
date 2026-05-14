export const WEEKDAYS = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];

type DatePart = {
  year?: number;
  month?: number;
  day: number;
};

function parsePart(raw: string, fallbackYear: number, fallbackMonth?: number): DatePart | null {
  const text = raw.trim();
  if (!text) return null;

  const full = text.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (full) return { year: Number(full[1]), month: Number(full[2]), day: Number(full[3]) };

  const monthDay = text.match(/^(\d{1,2})[/-](\d{1,2})$/);
  if (monthDay) return { year: fallbackYear, month: Number(monthDay[1]), day: Number(monthDay[2]) };

  const dayOnly = text.match(/^(\d{1,2})$/);
  if (dayOnly && fallbackMonth) return { year: fallbackYear, month: fallbackMonth, day: Number(dayOnly[1]) };

  return null;
}

function toIso(part: DatePart, fallbackYear: number): string | null {
  const year = part.year ?? fallbackYear;
  const month = part.month;
  if (!month) return null;

  const d = new Date(Date.UTC(year, month - 1, part.day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== part.day) return null;
  return d.toISOString().slice(0, 10);
}

function expandRange(startIso: string, endIso: string): string[] {
  const start = new Date(`${startIso}T00:00:00.000Z`);
  const end = new Date(`${endIso}T00:00:00.000Z`);
  if (start > end) return [];

  const out: string[] = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    out.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

export function weekdayOfIso(iso: string): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  return WEEKDAYS[d.getUTCDay()];
}

export function formatMonthDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}

export function parseCourseDateInput(input: string, fallbackYear = new Date().getFullYear()) {
  const errors: string[] = [];
  const normalized = input
    .replace(/[，,;\n]/g, "、")
    .replace(/[~～至到]/g, "-")
    .replace(/\s+/g, "");

  const dates: string[] = [];
  let currentMonth: number | undefined;

  for (const token of normalized.split("、").filter(Boolean)) {
    const rangeMatch = token.match(/^(.+?)-(.+)$/);
    if (rangeMatch) {
      const start = parsePart(rangeMatch[1], fallbackYear, currentMonth);
      if (start?.month) currentMonth = start.month;
      const end = parsePart(rangeMatch[2], start?.year ?? fallbackYear, start?.month ?? currentMonth);
      const startIso = start ? toIso(start, fallbackYear) : null;
      const endIso = end ? toIso(end, start?.year ?? fallbackYear) : null;
      if (!startIso || !endIso) {
        errors.push(token);
        continue;
      }
      dates.push(...expandRange(startIso, endIso));
      continue;
    }

    const part = parsePart(token, fallbackYear, currentMonth);
    if (part?.month) currentMonth = part.month;
    const iso = part ? toIso(part, fallbackYear) : null;
    if (iso) dates.push(iso);
    else errors.push(token);
  }

  return {
    dates: [...new Set(dates)].sort(),
    errors,
  };
}
