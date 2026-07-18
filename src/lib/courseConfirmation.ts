import { prisma } from "@/lib/prisma";

export type ConfirmationSemester = "1" | "2" | "summer";

export type CourseConfirmation = {
  toddlerClassCount?: string;
  smallClassCount?: string;
  middleClassCount?: string;
  bigClassCount?: string;
  location?: string;
  otherLocation?: string;
  rainyLocation?: string;
  teachingStyles?: string[];
  classNotes?: string;
  otherReminders?: string;
};

export type ConfirmationTerm = {
  academicYear: number;
  semester: ConfirmationSemester;
};

export type SchoolStartConfirmation = CourseConfirmation & ConfirmationTerm & {
  id?: number;
  schoolId?: number;
  submittedAt?: string | null;
  reopenedAt?: string | null;
  canSchoolEdit?: boolean;
  updatedAt?: string | null;
  createdAt?: string | null;
};

export type ConfirmationHistoryItem = {
  id: number;
  previousToddlerClassCount: string;
  newToddlerClassCount: string;
  previousSmallClassCount: string;
  previousMiddleClassCount: string;
  previousBigClassCount: string;
  newSmallClassCount: string;
  newMiddleClassCount: string;
  newBigClassCount: string;
  note: string;
  teacherName: string;
  createdAt: string;
};

export const TEACHING_STYLE_OPTIONS = ["活潑互動", "注重秩序", "依班級狀況調整"] as const;
export const LOCATION_OPTIONS = ["教室", "禮堂 / 活動中心", "操場", "其他"] as const;
export const SEMESTER_OPTIONS: Array<{ value: ConfirmationSemester; label: string }> = [
  { value: "1", label: "第1學期" },
  { value: "2", label: "第2學期" },
  { value: "summer", label: "暑期" },
];

let storageReady = false;

export function currentConfirmationTerm(date = new Date()): ConfirmationTerm {
  const month = date.getMonth() + 1;
  const year = date.getFullYear();
  if (month >= 7) return { academicYear: year - 1911, semester: "1" };
  return { academicYear: year - 1912, semester: "2" };
}

export function semesterLabel(semester: string | null | undefined) {
  if (semester === "1") return "第1學期";
  if (semester === "2") return "第2學期";
  if (semester === "summer") return "暑期";
  return "未設定學期";
}

export function semesterWesternLabel(term: ConfirmationTerm) {
  const startYear = term.academicYear + 1911;
  if (term.semester === "1") return `${startYear}-${startYear + 1} 上學期`;
  if (term.semester === "2") return `${startYear}-${startYear + 1} 下學期`;
  return `${startYear + 1} 暑期`;
}

export function termLabel(term: ConfirmationTerm) {
  return `${term.academicYear}學年度・${semesterLabel(term.semester)}`;
}

export function parseConfirmationTerm(input: { academicYear?: unknown; semester?: unknown } = {}): ConfirmationTerm {
  const current = currentConfirmationTerm();
  const academicYear = Number(input.academicYear);
  const semester = String(input.semester ?? current.semester);
  return {
    academicYear: Number.isFinite(academicYear) && academicYear >= 100 && academicYear <= 130 ? academicYear : current.academicYear,
    semester: semester === "1" || semester === "2" || semester === "summer" ? semester : current.semester,
  };
}

export function previousConfirmationTerm(term: ConfirmationTerm): ConfirmationTerm {
  if (term.semester === "2") return { academicYear: term.academicYear, semester: "1" };
  if (term.semester === "summer") return { academicYear: term.academicYear, semester: "2" };
  return { academicYear: term.academicYear - 1, semester: "summer" };
}

export function confirmationTermRange(term: ConfirmationTerm) {
  const startYear = term.academicYear + 1911;
  if (term.semester === "1") {
    return { start: new Date(startYear, 7, 1), end: new Date(startYear + 1, 1, 1) };
  }
  if (term.semester === "2") {
    return { start: new Date(startYear + 1, 1, 1), end: new Date(startYear + 1, 6, 1) };
  }
  return { start: new Date(startYear + 1, 6, 1), end: new Date(startYear + 1, 7, 1) };
}

export async function ensureCourseConfirmationStorage() {
  if (storageReady) return;
  await prisma.$executeRawUnsafe('ALTER TABLE School ADD COLUMN courseConfirmation TEXT NOT NULL DEFAULT ""').catch(() => undefined);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS SchoolStartConfirmation (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      schoolId INTEGER NOT NULL,
      academicYear INTEGER NOT NULL,
      semester TEXT NOT NULL,
      smallClassCount TEXT NOT NULL DEFAULT "",
      middleClassCount TEXT NOT NULL DEFAULT "",
      bigClassCount TEXT NOT NULL DEFAULT "",
      classLocation TEXT NOT NULL DEFAULT "",
      classLocationOther TEXT NOT NULL DEFAULT "",
      rainyDayLocation TEXT NOT NULL DEFAULT "",
      teachingStyles TEXT NOT NULL DEFAULT "[]",
      classNotes TEXT NOT NULL DEFAULT "",
      otherNotes TEXT NOT NULL DEFAULT "",
      submittedAt DATETIME,
      reopenedAt DATETIME,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(schoolId, academicYear, semester)
    )
  `);
  await prisma.$executeRawUnsafe("ALTER TABLE SchoolStartConfirmation ADD COLUMN reopenedAt DATETIME").catch(() => undefined);
  await prisma.$executeRawUnsafe('ALTER TABLE SchoolStartConfirmation ADD COLUMN toddlerClassCount TEXT NOT NULL DEFAULT ""').catch(() => undefined);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS SchoolStartConfirmationHistory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      confirmationId INTEGER NOT NULL,
      updatedByTeacherId INTEGER,
      updatedByAdminId INTEGER,
      previousSmallClassCount TEXT NOT NULL DEFAULT "",
      previousMiddleClassCount TEXT NOT NULL DEFAULT "",
      previousLargeClassCount TEXT NOT NULL DEFAULT "",
      newSmallClassCount TEXT NOT NULL DEFAULT "",
      newMiddleClassCount TEXT NOT NULL DEFAULT "",
      newLargeClassCount TEXT NOT NULL DEFAULT "",
      note TEXT NOT NULL DEFAULT "",
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await prisma.$executeRawUnsafe('ALTER TABLE SchoolStartConfirmationHistory ADD COLUMN previousToddlerClassCount TEXT NOT NULL DEFAULT ""').catch(() => undefined);
  await prisma.$executeRawUnsafe('ALTER TABLE SchoolStartConfirmationHistory ADD COLUMN newToddlerClassCount TEXT NOT NULL DEFAULT ""').catch(() => undefined);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS CourseStartConfirmation (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      attendanceId INTEGER NOT NULL UNIQUE,
      schoolId INTEGER NOT NULL,
      courseId INTEGER NOT NULL,
      courseName TEXT NOT NULL DEFAULT "",
      schoolName TEXT NOT NULL DEFAULT "",
      date TEXT NOT NULL DEFAULT "",
      teacherId INTEGER,
      teacherName TEXT NOT NULL DEFAULT "",
      toddlerClassCount INTEGER NOT NULL DEFAULT 0,
      smallClassCount INTEGER NOT NULL DEFAULT 0,
      middleClassCount INTEGER NOT NULL DEFAULT 0,
      bigClassCount INTEGER NOT NULL DEFAULT 0,
      totalCount INTEGER NOT NULL DEFAULT 0,
      location TEXT NOT NULL DEFAULT "",
      classNotes TEXT NOT NULL DEFAULT "",
      submittedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  storageReady = true;
}

export const ensureCourseConfirmationColumn = ensureCourseConfirmationStorage;

function cleanText(value: unknown) {
  return String(value ?? "").trim();
}

function cleanCount(value: unknown) {
  const raw = cleanText(value).replace(/[^\d]/g, "");
  return raw ? String(Math.max(0, Number(raw))) : "";
}

function parseTeachingStyles(value: unknown) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : value.split(/[、,，]/);
    } catch {
      return value.split(/[、,，]/);
    }
  }
  return [];
}

export function normalizeCourseConfirmation(value: unknown): CourseConfirmation {
  const source = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const styles = parseTeachingStyles(source.teachingStyles)
    .map(cleanText)
    .filter((item) => TEACHING_STYLE_OPTIONS.includes(item as never));
  const location = cleanText(source.location ?? source.classLocation);
  return {
    toddlerClassCount: cleanCount(source.toddlerClassCount),
    smallClassCount: cleanCount(source.smallClassCount),
    middleClassCount: cleanCount(source.middleClassCount),
    bigClassCount: cleanCount(source.bigClassCount ?? source.largeClassCount),
    location: LOCATION_OPTIONS.includes(location as never) ? location : "",
    otherLocation: cleanText(source.otherLocation ?? source.classLocationOther),
    rainyLocation: cleanText(source.rainyLocation ?? source.rainyDayLocation),
    teachingStyles: [...new Set(styles)],
    classNotes: cleanText(source.classNotes),
    otherReminders: cleanText(source.otherReminders ?? source.otherNotes),
  };
}

export function parseCourseConfirmation(raw: unknown): CourseConfirmation {
  if (!raw) return {};
  if (typeof raw === "object") return normalizeCourseConfirmation(raw);
  try {
    return normalizeCourseConfirmation(JSON.parse(String(raw)));
  } catch {
    return {};
  }
}

export function serializeCourseConfirmation(value: unknown) {
  return JSON.stringify(normalizeCourseConfirmation(value));
}

function fromRow(row: ConfirmationRow): SchoolStartConfirmation {
  const submittedAt = row.submittedAt ? String(row.submittedAt) : null;
  const reopenedAt = row.reopenedAt ? String(row.reopenedAt) : null;
  return {
    id: Number(row.id),
    schoolId: Number(row.schoolId),
    academicYear: Number(row.academicYear),
    semester: row.semester as ConfirmationSemester,
    toddlerClassCount: row.toddlerClassCount ?? "",
    smallClassCount: row.smallClassCount ?? "",
    middleClassCount: row.middleClassCount ?? "",
    bigClassCount: row.bigClassCount ?? "",
    location: row.classLocation ?? "",
    otherLocation: row.classLocationOther ?? "",
    rainyLocation: row.rainyDayLocation ?? "",
    teachingStyles: parseTeachingStyles(row.teachingStyles).map(cleanText).filter(Boolean),
    classNotes: row.classNotes ?? "",
    otherReminders: row.otherNotes ?? "",
    submittedAt,
    reopenedAt,
    canSchoolEdit: canEditSubmittedConfirmation(submittedAt, reopenedAt),
    updatedAt: row.updatedAt ? String(row.updatedAt) : null,
    createdAt: row.createdAt ? String(row.createdAt) : null,
  };
}

export function canEditSubmittedConfirmation(submittedAt?: string | null, reopenedAt?: string | null) {
  if (!submittedAt) return true;
  if (!reopenedAt) return false;
  return new Date(reopenedAt).getTime() > new Date(submittedAt).getTime();
}

type ConfirmationRow = {
  id: number;
  schoolId: number;
  academicYear: number;
  semester: string;
  toddlerClassCount: string | null;
  smallClassCount: string;
  middleClassCount: string;
  bigClassCount: string;
  classLocation: string;
  classLocationOther: string;
  rainyDayLocation: string;
  teachingStyles: string;
  classNotes: string;
  otherNotes: string;
  submittedAt: string | null;
  reopenedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

async function legacySchoolConfirmation(schoolId: number) {
  await ensureCourseConfirmationStorage();
  const rows = await prisma.$queryRawUnsafe<Array<{ courseConfirmation: string | null }>>(
    "SELECT courseConfirmation FROM School WHERE id = ? LIMIT 1",
    schoolId,
  );
  return parseCourseConfirmation(rows[0]?.courseConfirmation);
}

export async function getSchoolStartConfirmation(schoolId: number, term = currentConfirmationTerm()) {
  await ensureCourseConfirmationStorage();
  const rows = await prisma.$queryRawUnsafe<ConfirmationRow[]>(
    "SELECT * FROM SchoolStartConfirmation WHERE schoolId = ? AND academicYear = ? AND semester = ? LIMIT 1",
    schoolId,
    term.academicYear,
    term.semester,
  );
  if (rows[0]) return fromRow(rows[0]);
  return { ...term, schoolId, ...(await legacySchoolConfirmation(schoolId)) };
}

export async function upsertSchoolStartConfirmation(
  schoolId: number,
  term: ConfirmationTerm,
  value: unknown,
  options: { submit?: boolean } = { submit: true },
) {
  await ensureCourseConfirmationStorage();
  const form = normalizeCourseConfirmation(value);
  const styles = JSON.stringify(form.teachingStyles ?? []);
  const submit = options.submit !== false;
  await prisma.$executeRawUnsafe(
    `INSERT INTO SchoolStartConfirmation (
      schoolId, academicYear, semester, toddlerClassCount, smallClassCount, middleClassCount, bigClassCount,
      classLocation, classLocationOther, rainyDayLocation, teachingStyles, classNotes, otherNotes,
      submittedAt, reopenedAt, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ${submit ? "CURRENT_TIMESTAMP" : "NULL"}, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(schoolId, academicYear, semester) DO UPDATE SET
      toddlerClassCount = excluded.toddlerClassCount,
      smallClassCount = excluded.smallClassCount,
      middleClassCount = excluded.middleClassCount,
      bigClassCount = excluded.bigClassCount,
      classLocation = excluded.classLocation,
      classLocationOther = excluded.classLocationOther,
      rainyDayLocation = excluded.rainyDayLocation,
      teachingStyles = excluded.teachingStyles,
      classNotes = excluded.classNotes,
      otherNotes = excluded.otherNotes,
      submittedAt = CASE WHEN ? THEN CURRENT_TIMESTAMP ELSE SchoolStartConfirmation.submittedAt END,
      reopenedAt = CASE WHEN ? THEN NULL ELSE SchoolStartConfirmation.reopenedAt END,
      updatedAt = CURRENT_TIMESTAMP`,
    schoolId,
    term.academicYear,
    term.semester,
    form.toddlerClassCount ?? "",
    form.smallClassCount ?? "",
    form.middleClassCount ?? "",
    form.bigClassCount ?? "",
    form.location ?? "",
    form.otherLocation ?? "",
    form.rainyLocation ?? "",
    styles,
    form.classNotes ?? "",
    form.otherReminders ?? "",
    submit ? 1 : 0,
    submit ? 1 : 0,
  );
  await prisma.$executeRawUnsafe(
    "UPDATE School SET courseConfirmation = ? WHERE id = ?",
    serializeCourseConfirmation(form),
    schoolId,
  ).catch(() => undefined);
  return getSchoolStartConfirmation(schoolId, term);
}

export async function copyPreviousSchoolStartConfirmation(schoolId: number, term: ConfirmationTerm, options: { submit?: boolean } = { submit: false }) {
  const previous = previousConfirmationTerm(term);
  const previousForm = await getSchoolStartConfirmation(schoolId, previous);
  return upsertSchoolStartConfirmation(schoolId, term, previousForm, options);
}

export async function reopenSchoolStartConfirmation(schoolId: number, term: ConfirmationTerm) {
  await ensureCourseConfirmationStorage();
  await prisma.$executeRawUnsafe(
    `INSERT INTO SchoolStartConfirmation (
      schoolId, academicYear, semester, createdAt, updatedAt, reopenedAt
    ) VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(schoolId, academicYear, semester) DO UPDATE SET
      reopenedAt = CURRENT_TIMESTAMP,
      updatedAt = CURRENT_TIMESTAMP`,
    schoolId,
    term.academicYear,
    term.semester,
  );
  return getSchoolStartConfirmation(schoolId, term);
}

export async function resetSchoolStartConfirmation(schoolId: number, term: ConfirmationTerm) {
  await ensureCourseConfirmationStorage();
  const rows = await prisma.$queryRawUnsafe<Array<{ id: number }>>(
    "SELECT id FROM SchoolStartConfirmation WHERE schoolId = ? AND academicYear = ? AND semester = ?",
    schoolId,
    term.academicYear,
    term.semester,
  );
  for (const row of rows) {
    await prisma.$executeRawUnsafe("DELETE FROM SchoolStartConfirmationHistory WHERE confirmationId = ?", Number(row.id));
  }
  await prisma.$executeRawUnsafe(
    "DELETE FROM SchoolStartConfirmation WHERE schoolId = ? AND academicYear = ? AND semester = ?",
    schoolId,
    term.academicYear,
    term.semester,
  );
  await prisma.$executeRawUnsafe(
    "UPDATE School SET courseConfirmation = ? WHERE id = ?",
    "",
    schoolId,
  ).catch(() => undefined);
  return getSchoolStartConfirmation(schoolId, term);
}

export async function updateConfirmationCounts(input: {
  schoolId: number;
  term: ConfirmationTerm;
  toddlerClassCount?: unknown;
  smallClassCount?: unknown;
  middleClassCount?: unknown;
  bigClassCount?: unknown;
  note?: unknown;
  teacherId?: number | null;
  adminId?: number | null;
}) {
  const current = await getSchoolStartConfirmation(input.schoolId, input.term);
  const next = {
    ...current,
    toddlerClassCount: cleanCount(input.toddlerClassCount ?? current.toddlerClassCount),
    smallClassCount: cleanCount(input.smallClassCount ?? current.smallClassCount),
    middleClassCount: cleanCount(input.middleClassCount ?? current.middleClassCount),
    bigClassCount: cleanCount(input.bigClassCount ?? current.bigClassCount),
  };
  const saved = await upsertSchoolStartConfirmation(input.schoolId, input.term, next, { submit: false });
  if (saved.id) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO SchoolStartConfirmationHistory (
        confirmationId, updatedByTeacherId, updatedByAdminId,
        previousToddlerClassCount, previousSmallClassCount, previousMiddleClassCount, previousLargeClassCount,
        newToddlerClassCount, newSmallClassCount, newMiddleClassCount, newLargeClassCount, note, createdAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      saved.id,
      input.teacherId ?? null,
      input.adminId ?? null,
      current.toddlerClassCount ?? "",
      current.smallClassCount ?? "",
      current.middleClassCount ?? "",
      current.bigClassCount ?? "",
      next.toddlerClassCount ?? "",
      next.smallClassCount ?? "",
      next.middleClassCount ?? "",
      next.bigClassCount ?? "",
      cleanText(input.note),
    );
  }
  return saved;
}

export async function confirmationHistory(confirmationId: number) {
  await ensureCourseConfirmationStorage();
  const rows = await prisma.$queryRawUnsafe<Array<{
    id: number;
    previousToddlerClassCount: string | null;
    newToddlerClassCount: string | null;
    previousSmallClassCount: string;
    previousMiddleClassCount: string;
    previousLargeClassCount: string;
    newSmallClassCount: string;
    newMiddleClassCount: string;
    newLargeClassCount: string;
    note: string;
    teacherName: string | null;
    createdAt: string;
  }>>(
    `SELECT h.*, t.name as teacherName
     FROM SchoolStartConfirmationHistory h
     LEFT JOIN Teacher t ON t.id = h.updatedByTeacherId
     WHERE h.confirmationId = ?
     ORDER BY h.createdAt DESC, h.id DESC`,
    confirmationId,
  );
  return rows.map((row) => ({
    id: Number(row.id),
    previousToddlerClassCount: row.previousToddlerClassCount ?? "",
    newToddlerClassCount: row.newToddlerClassCount ?? "",
    previousSmallClassCount: row.previousSmallClassCount ?? "",
    previousMiddleClassCount: row.previousMiddleClassCount ?? "",
    previousBigClassCount: row.previousLargeClassCount ?? "",
    newSmallClassCount: row.newSmallClassCount ?? "",
    newMiddleClassCount: row.newMiddleClassCount ?? "",
    newBigClassCount: row.newLargeClassCount ?? "",
    note: row.note ?? "",
    teacherName: row.teacherName ?? "行政",
    createdAt: String(row.createdAt),
  }));
}

export function courseConfirmationSummary(value: unknown, options: { multiline?: boolean; teacher?: boolean; includeTerm?: boolean } = {}) {
  const termSource = (value && typeof value === "object" ? value : {}) as Partial<ConfirmationTerm>;
  const form = parseCourseConfirmation(value);
  const hasAnyCount = Boolean(form.toddlerClassCount || form.smallClassCount || form.middleClassCount || form.bigClassCount);
  // 若有填任何人數，四班皆顯示（沒填的顯示 0），符合「若沒有幼幼班，顯示 0」規則
  const people = hasAnyCount
    ? [
        `幼幼班 ${form.toddlerClassCount || "0"}`,
        `小班 ${form.smallClassCount || "0"}`,
        `中班 ${form.middleClassCount || "0"}`,
        `大班 ${form.bigClassCount || "0"}`,
      ].join("｜")
    : "";
  const locationName = form.location === "其他" ? form.otherLocation : form.location;
  const place = [
    locationName ? `地點：${locationName}` : "",
    form.rainyLocation ? `雨天：${form.rainyLocation}` : "",
  ].filter(Boolean).join("｜");
  const style = form.teachingStyles?.length ? `教學方式：${form.teachingStyles.join("、")}` : "";
  const notes = form.classNotes ? `注意事項：${form.classNotes}` : "";
  const reminders = form.otherReminders ? `其他提醒：${form.otherReminders}` : "";
  const rows = [
    people ? `人數：${people}` : "",
    place,
    style,
    notes,
    reminders,
  ].filter(Boolean);
  if (rows.length === 0) return "";
  const parsedTerm = termSource.academicYear && termSource.semester ? parseConfirmationTerm(termSource) : null;
  const title = parsedTerm ? `${termLabel(parsedTerm)} 開課前確認` : "開課前確認";
  if (options.teacher) return [title, ...rows].join("\n");
  if (options.includeTerm && parsedTerm) return [title, ...rows].join(options.multiline ? "\n" : "　");
  return rows.join(options.multiline ? "\n" : "　");
}

export async function courseConfirmationMapBySchoolIds(ids: number[], term = currentConfirmationTerm()) {
  await ensureCourseConfirmationStorage();
  const unique = [...new Set(ids.filter((id) => Number.isFinite(id) && id > 0))];
  if (unique.length === 0) return new Map<number, SchoolStartConfirmation>();
  const rows = await prisma.$queryRawUnsafe<ConfirmationRow[]>(
    `SELECT * FROM SchoolStartConfirmation WHERE academicYear = ? AND semester = ? AND schoolId IN (${unique.map(() => "?").join(",")})`,
    term.academicYear,
    term.semester,
    ...unique,
  );
  const map = new Map(rows.map((row) => [Number(row.schoolId), fromRow(row)]));
  const missing = unique.filter((schoolId) => !map.has(schoolId));
  if (missing.length > 0) {
    // 一次撈齊 legacy 設定，避免逐校查詢（N+1）拖慢 API
    const legacyRows = await prisma.$queryRawUnsafe<Array<{ id: number; courseConfirmation: string | null }>>(
      `SELECT id, courseConfirmation FROM School WHERE id IN (${missing.map(() => "?").join(",")})`,
      ...missing,
    );
    const legacyMap = new Map(legacyRows.map((row) => [Number(row.id), row.courseConfirmation]));
    for (const schoolId of missing) {
      map.set(schoolId, { ...term, schoolId, ...parseCourseConfirmation(legacyMap.get(schoolId)) });
    }
  }
  return map;
}

// ===== 開課前確認（每課程第一堂課、老師填寫）=====

export type CourseStartConfirmationRecord = {
  id: number;
  attendanceId: number;
  schoolId: number;
  courseId: number;
  courseName: string;
  schoolName: string;
  date: string;
  teacherId: number | null;
  teacherName: string;
  toddlerClassCount: number;
  smallClassCount: number;
  middleClassCount: number;
  bigClassCount: number;
  totalCount: number;
  location: string;
  classNotes: string;
  submittedAt: string;
};

type CourseStartRow = Record<string, unknown>;

function fromCourseStartRow(row: CourseStartRow): CourseStartConfirmationRecord {
  return {
    id: Number(row.id),
    attendanceId: Number(row.attendanceId),
    schoolId: Number(row.schoolId),
    courseId: Number(row.courseId),
    courseName: String(row.courseName ?? ""),
    schoolName: String(row.schoolName ?? ""),
    date: String(row.date ?? ""),
    teacherId: row.teacherId == null ? null : Number(row.teacherId),
    teacherName: String(row.teacherName ?? ""),
    toddlerClassCount: Number(row.toddlerClassCount ?? 0),
    smallClassCount: Number(row.smallClassCount ?? 0),
    middleClassCount: Number(row.middleClassCount ?? 0),
    bigClassCount: Number(row.bigClassCount ?? 0),
    totalCount: Number(row.totalCount ?? 0),
    location: String(row.location ?? ""),
    classNotes: String(row.classNotes ?? ""),
    submittedAt: String(row.submittedAt ?? ""),
  };
}

function cleanCountNumber(value: unknown) {
  const parsed = Number(String(value ?? "").replace(/[^\d]/g, ""));
  return Number.isFinite(parsed) ? Math.max(0, Math.min(999, parsed)) : 0;
}

export async function getCourseStartConfirmationByAttendance(attendanceId: number) {
  await ensureCourseConfirmationStorage();
  const rows = await prisma.$queryRawUnsafe<CourseStartRow[]>(
    "SELECT * FROM CourseStartConfirmation WHERE attendanceId = ? LIMIT 1",
    attendanceId,
  );
  return rows[0] ? fromCourseStartRow(rows[0]) : null;
}

// 同課程本學期是否已完成開課前確認（第一堂填過就不再重複）
export async function getCourseStartConfirmationForCourseTerm(courseId: number, term = currentConfirmationTerm()) {
  await ensureCourseConfirmationStorage();
  const range = confirmationTermRange(term);
  const rows = await prisma.$queryRawUnsafe<CourseStartRow[]>(
    "SELECT * FROM CourseStartConfirmation WHERE courseId = ? AND date >= ? AND date < ? ORDER BY submittedAt DESC LIMIT 1",
    courseId,
    range.start.toISOString().slice(0, 10),
    range.end.toISOString().slice(0, 10),
  );
  return rows[0] ? fromCourseStartRow(rows[0]) : null;
}

export async function listCourseStartConfirmationsBySchool(schoolId: number, term = currentConfirmationTerm()) {
  await ensureCourseConfirmationStorage();
  const range = confirmationTermRange(term);
  const rows = await prisma.$queryRawUnsafe<CourseStartRow[]>(
    "SELECT * FROM CourseStartConfirmation WHERE schoolId = ? AND date >= ? AND date < ? ORDER BY submittedAt DESC",
    schoolId,
    range.start.toISOString().slice(0, 10),
    range.end.toISOString().slice(0, 10),
  );
  return rows.map(fromCourseStartRow);
}

export async function createCourseStartConfirmation(input: {
  attendanceId: number;
  schoolId: number;
  courseId: number;
  courseName?: unknown;
  schoolName?: unknown;
  date?: unknown;
  teacherId?: number | null;
  teacherName?: unknown;
  toddlerClassCount?: unknown;
  smallClassCount?: unknown;
  middleClassCount?: unknown;
  bigClassCount?: unknown;
  location?: unknown;
  classNotes?: unknown;
}) {
  await ensureCourseConfirmationStorage();
  const counts = {
    toddler: cleanCountNumber(input.toddlerClassCount),
    small: cleanCountNumber(input.smallClassCount),
    middle: cleanCountNumber(input.middleClassCount),
    big: cleanCountNumber(input.bigClassCount),
  };
  const total = counts.toddler + counts.small + counts.middle + counts.big;
  await prisma.$executeRawUnsafe(
    `INSERT INTO CourseStartConfirmation (
      attendanceId, schoolId, courseId, courseName, schoolName, date, teacherId, teacherName,
      toddlerClassCount, smallClassCount, middleClassCount, bigClassCount, totalCount,
      location, classNotes, submittedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    input.attendanceId,
    input.schoolId,
    input.courseId,
    cleanText(input.courseName),
    cleanText(input.schoolName),
    cleanText(input.date),
    input.teacherId ?? null,
    cleanText(input.teacherName),
    counts.toddler,
    counts.small,
    counts.middle,
    counts.big,
    total,
    cleanText(input.location),
    cleanText(input.classNotes),
  );
  return getCourseStartConfirmationByAttendance(input.attendanceId);
}

export async function updateCourseStartConfirmation(id: number, input: {
  toddlerClassCount?: unknown;
  smallClassCount?: unknown;
  middleClassCount?: unknown;
  bigClassCount?: unknown;
  location?: unknown;
  classNotes?: unknown;
}) {
  await ensureCourseConfirmationStorage();
  const rows = await prisma.$queryRawUnsafe<CourseStartRow[]>("SELECT * FROM CourseStartConfirmation WHERE id = ? LIMIT 1", id);
  if (!rows[0]) return null;
  const current = fromCourseStartRow(rows[0]);
  const counts = {
    toddler: input.toddlerClassCount === undefined ? current.toddlerClassCount : cleanCountNumber(input.toddlerClassCount),
    small: input.smallClassCount === undefined ? current.smallClassCount : cleanCountNumber(input.smallClassCount),
    middle: input.middleClassCount === undefined ? current.middleClassCount : cleanCountNumber(input.middleClassCount),
    big: input.bigClassCount === undefined ? current.bigClassCount : cleanCountNumber(input.bigClassCount),
  };
  await prisma.$executeRawUnsafe(
    `UPDATE CourseStartConfirmation SET
      toddlerClassCount = ?, smallClassCount = ?, middleClassCount = ?, bigClassCount = ?, totalCount = ?,
      location = ?, classNotes = ?
    WHERE id = ?`,
    counts.toddler,
    counts.small,
    counts.middle,
    counts.big,
    counts.toddler + counts.small + counts.middle + counts.big,
    input.location === undefined ? current.location : cleanText(input.location),
    input.classNotes === undefined ? current.classNotes : cleanText(input.classNotes),
    id,
  );
  const updated = await prisma.$queryRawUnsafe<CourseStartRow[]>("SELECT * FROM CourseStartConfirmation WHERE id = ? LIMIT 1", id);
  return updated[0] ? fromCourseStartRow(updated[0]) : null;
}
