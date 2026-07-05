import ExcelJS from "exceljs";
import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { parseAttendanceDay } from "@/lib/attendanceBatch";
import { stampAttendanceTime } from "@/lib/attendanceTime";
import { nextCourseCode } from "@/lib/courseCode";
import { weekdayOfIso } from "@/lib/courseDates";
import { normalizeCategory, normalizeRegion } from "@/lib/courseMeta";
import { attendanceHoursFromCourseTime } from "@/lib/courseHours";
import { ensureCoursePayrollHoursColumn, parsePayrollHours } from "@/lib/payrollHours";
import { WAITING_TEACHER_NAME } from "@/lib/teacherAssignment";

const CAMP_CATEGORY = "營隊";
const CAMP_DEPARTMENT = "安親班";

export type SummerCampImportMode = "skip" | "overwrite";

type ImportRow = {
  rowNumber: number;
  schoolName: string;
  type: string;
  address: string;
  region: string;
  courseType: string;
  timeRaw: string;
  time: string;
  dateRaw: string;
  dates: string[];
  dateErrors: string[];
  teacherName: string;
  assistantTeacherName: string;
  payrollHoursRaw: string;
  payrollHours: number | null;
  category: string;
  notes: string;
  timeNeedsReview: boolean;
  missingFields: string[];
};

export type SummerCampImportAction = {
  rowNumber: number;
  action: "create" | "overwrite" | "skip" | "blocked";
  reason: string;
  schoolName: string;
  address: string;
  courseType: string;
  date: string;
  time: string;
  category: string;
  teacherName: string;
  resolvedTeacherName: string;
  assistantTeacherName: string;
  resolvedAssistantTeacherName: string;
  payrollHours: number;
  existingAttendanceId?: number;
  existingCourseId?: number;
  safeToOverwrite: boolean;
  safetyReasons: string[];
};

export type SummerCampDryRun = {
  ok: boolean;
  year: number;
  importMode: SummerCampImportMode;
  summary: {
    totalRows: number;
    validRows: number;
    newSchools: number;
    updateSchools: number;
    newCourses: number;
    newAttendanceDates: number;
    duplicates: number;
    dateErrors: number;
    timeNeedsReview: number;
    missingFields: number;
    schoolConflicts: number;
    createdAttendances: number;
    overwrittenAttendances: number;
    skippedDuplicates: number;
    missingTeachers: number;
    blockedOverwrites: number;
    errors: number;
  };
  rows: ImportRow[];
  newSchools: Array<{ name: string; address: string; region: string }>;
  updateSchools: Array<{ id: number; name: string; address: string; updates: string[] }>;
  courseGroups: Array<{
    key: string;
    schoolName: string;
    address: string;
    courseType: string;
    time: string;
    category: string;
    teacherName: string;
    assistantTeacherName: string;
    payrollHours: number | null;
    notes: string;
    dates: string[];
    rowNumbers: number[];
    timeNeedsReview: boolean;
  }>;
  actions: SummerCampImportAction[];
  teacherWarnings: Array<{ rowNumber: number; field: string; name: string; fallback: string }>;
  blockedOverwrites: SummerCampImportAction[];
  skippedDuplicates: SummerCampImportAction[];
  duplicates: Array<{ rowNumbers: number[]; reason: string; schoolName: string; address: string; courseType: string; time: string; dates: string[] }>;
  dateErrors: Array<{ rowNumber: number; value: string; errors: string[] }>;
  timeNeedsReview: Array<{ rowNumber: number; value: string; reason: string }>;
  missingFields: Array<{ rowNumber: number; fields: string[] }>;
  schoolConflicts: Array<{ rowNumber: number; name: string; address: string; existingAddress: string; reason: string }>;
};

export type SummerCampImportResult = SummerCampDryRun & {
  imported?: {
    schoolsCreated: number;
    schoolsUpdated: number;
    coursesCreated: number;
    coursesUpdated: number;
    attendancesCreated: number;
    attendancesUpdated: number;
    attendancesSkipped: number;
    blockedOverwrites: number;
    missingTeachers: number;
    errors: number;
  };
};

type ExistingSchool = {
  id: number;
  name: string;
  type: string;
  region: string;
  address: string;
};

type ExistingTeacher = {
  id: number;
  name: string;
};

type ExistingCourse = {
  id: number;
  schoolId: number | null;
  school: string;
  courseType: string;
  time: string;
  department: string;
  category: string;
  teacherId: number;
  assistantTeacherId: number | null;
  attendances?: Array<{
    id: number;
    date: Date;
    actualTeacherId: number;
    assistantTeacherId: number | null;
    isPayrollLocked: boolean;
    reportContent: string;
    reportSentAt: Date | null;
    schoolNotifiedAt: Date | null;
    schoolNotifyStatus: string;
    cancelled: boolean;
    substitutes: Array<{ id: number; role: string }>;
  }>;
};

function clean(value: unknown) {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object" && "richText" in value && Array.isArray((value as { richText?: unknown }).richText)) {
    return ((value as { richText: Array<{ text?: unknown }> }).richText).map((part) => String(part.text ?? "")).join("").trim();
  }
  if (typeof value === "object" && "text" in value) return String((value as { text?: unknown }).text ?? "").trim();
  return String(value).trim();
}

function compact(value: string) {
  return value.replace(/\s+/g, "").trim();
}

function schoolKey(name: string, address: string) {
  return `${compact(name)}|${compact(address)}`;
}

function courseKey(input: Pick<ImportRow, "schoolName" | "address" | "courseType" | "time" | "category">) {
  return `${schoolKey(input.schoolName, input.address)}|${compact(input.courseType)}|${compact(input.time)}|${CAMP_DEPARTMENT}|${compact(input.category)}`;
}

function sameCourseIdentity(
  input: Pick<ImportRow, "schoolName" | "address" | "courseType" | "time" | "category">,
  course: Pick<ExistingCourse, "schoolId" | "school" | "courseType" | "time" | "department" | "category">,
  schools: ExistingSchool[],
) {
  const matchedSchool = schools.find((school) => schoolKey(school.name, school.address) === schoolKey(input.schoolName, input.address));
  const sameSchool = matchedSchool
    ? course.schoolId === matchedSchool.id || compact(course.school) === compact(input.schoolName)
    : compact(course.school) === compact(input.schoolName);
  return sameSchool
    && compact(course.courseType) === compact(input.courseType)
    && compact(course.time) === compact(input.time)
    && course.department === CAMP_DEPARTMENT
    && normalizeCategory(course.category) === input.category;
}

function monthDayToIso(year: number, month: number, day: number) {
  if (!month || !day) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date.toISOString().slice(0, 10);
}

function parseDatePart(raw: string, currentMonth: number | null) {
  const value = raw.trim();
  const full = value.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (full) return { year: Number(full[1]), month: Number(full[2]), day: Number(full[3]) };
  const monthDay = value.match(/^(\d{1,2})[/-](\d{1,2})(?:\D.*)?$/);
  if (monthDay) return { month: Number(monthDay[1]), day: Number(monthDay[2]) };
  const dayOnly = value.match(/^(\d{1,2})(?:\D.*)?$/);
  if (dayOnly && currentMonth) return { month: currentMonth, day: Number(dayOnly[1]) };
  return null;
}

export function parseSummerDates(input: string, year: number) {
  const errors: string[] = [];
  const dates: string[] = [];
  let currentMonth: number | null = null;
  const normalized = input
    .replace(/（[^）]*）|\([^)]*\)/g, "")
    .replace(/[，,；;\n.]/g, "、")
    .replace(/\s+/g, "、")
    .replace(/[～~至到]/g, "-")
    .trim();

  for (const token of normalized.split("、").filter(Boolean)) {
    const single = parseDatePart(token, currentMonth);
    if (single?.year) {
      currentMonth = single.month;
      const iso = monthDayToIso(single.year, single.month, single.day);
      if (iso) dates.push(iso);
      else errors.push(token);
      continue;
    }

    const range = token.match(/^(.+?)-(.+)$/);
    if (range) {
      const start = parseDatePart(range[1], currentMonth);
      if (start) currentMonth = start.month;
      const end = parseDatePart(range[2], start?.month ?? currentMonth);
      const startIso = start ? monthDayToIso(start.year ?? year, start.month, start.day) : null;
      const endIso = end ? monthDayToIso(end.year ?? start?.year ?? year, end.month, end.day) : null;
      if (!startIso || !endIso || startIso > endIso) {
        errors.push(token);
        continue;
      }
      const cursor = new Date(`${startIso}T00:00:00.000Z`);
      const endDate = new Date(`${endIso}T00:00:00.000Z`);
      while (cursor <= endDate) {
        dates.push(cursor.toISOString().slice(0, 10));
        cursor.setUTCDate(cursor.getUTCDate() + 1);
      }
      continue;
    }

    const part = parseDatePart(token, currentMonth);
    if (part) currentMonth = part.month;
    const iso = part ? monthDayToIso(part.year ?? year, part.month, part.day) : null;
    if (iso) dates.push(iso);
    else errors.push(token);
  }

  return { dates: [...new Set(dates)].sort(), errors };
}

function normalizeTime(input: string) {
  const raw = input.trim();
  if (!raw) return { time: "", needsReview: true, reason: "上課時間空白" };
  const normalized = raw
    .replace(/[－–—]/g, "-")
    .replace(/[～~]/g, "-")
    .replace(/至|到/g, "-")
    .replace(/：/g, ":")
    .replace(/\s+/g, "");
  const match = normalized.match(/^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/);
  if (!match) return { time: raw, needsReview: true, reason: "時間格式不完整或非明確起訖時間" };
  const startHour = Number(match[1]);
  const startMinute = Number(match[2]);
  const endHour = Number(match[3]);
  const endMinute = Number(match[4]);
  const valid = [startHour, endHour].every((hour) => hour >= 0 && hour <= 23) && [startMinute, endMinute].every((minute) => minute >= 0 && minute <= 59);
  if (!valid) return { time: raw, needsReview: true, reason: "時間超出可接受範圍" };
  const pad = (n: number) => String(n).padStart(2, "0");
  return { time: `${pad(startHour)}:${pad(startMinute)}-${pad(endHour)}:${pad(endMinute)}`, needsReview: false, reason: "" };
}

function headerName(value: unknown) {
  return clean(value).replace(/\s+/g, "");
}

function findHeader(headers: string[], candidates: string[]) {
  return headers.findIndex((header) => candidates.includes(header));
}

function optionalValue(values: unknown[], index: number) {
  return index >= 0 ? clean(values[index]) : "";
}

async function parseWorkbook(file: File, year: number) {
  const workbook = new ExcelJS.Workbook();
  const buffer = await file.arrayBuffer();
  const xlsx = workbook.xlsx as unknown as {
    load: (data: ArrayBuffer, options?: { ignoreNodes?: string[] }) => Promise<ExcelJS.Workbook>;
    _processDrawingEntry?: () => Promise<void>;
    _processDrawingRelsEntry?: () => Promise<void>;
    _processVmlDrawingEntry?: () => Promise<void>;
    _processMediaEntry?: () => Promise<void>;
  };
  xlsx._processDrawingEntry = async () => undefined;
  xlsx._processDrawingRelsEntry = async () => undefined;
  xlsx._processVmlDrawingEntry = async () => undefined;
  xlsx._processMediaEntry = async () => undefined;
  await xlsx.load(buffer, { ignoreNodes: ["drawing", "picture"] });
  const worksheet = workbook.worksheets[0];
  if (!worksheet) throw new Error("Excel 沒有可讀取的工作表");

  const headerRow = worksheet.getRow(1);
  const headers = headerRow.values as unknown[];
  const normalizedHeaders = headers.map(headerName);
  const columns = {
    schoolName: findHeader(normalizedHeaders, ["園所名稱", "學校名稱", "園所", "學校"]),
    type: findHeader(normalizedHeaders, ["類型", "園所類型", "部門"]),
    address: findHeader(normalizedHeaders, ["地址", "園所地址", "上課地址"]),
    region: findHeader(normalizedHeaders, ["地區", "縣市", "區域"]),
    courseType: findHeader(normalizedHeaders, ["課程項目", "課程", "項目"]),
    time: findHeader(normalizedHeaders, ["上課時間", "時間"]),
    dates: findHeader(normalizedHeaders, ["日期", "上課日期", "實際上課日期"]),
    teacher: findHeader(normalizedHeaders, ["主教老師", "主教", "老師", "授課老師", "負責老師", "課程主教"]),
    assistantTeacher: findHeader(normalizedHeaders, ["助教老師", "助教", "助教老師可選"]),
    payrollHours: findHeader(normalizedHeaders, ["計薪時數", "薪資時數", "時數", "小時"]),
    category: findHeader(normalizedHeaders, ["類別", "課程類別"]),
    notes: findHeader(normalizedHeaders, ["備註", "說明", "備註說明"]),
  };
  const requiredHeaderLabels = {
    schoolName: "園所名稱",
    address: "地址",
    region: "地區",
    courseType: "課程項目",
    time: "上課時間",
    dates: "日期",
  };
  const requiredHeaders = Object.entries({
    schoolName: columns.schoolName,
    address: columns.address,
    region: columns.region,
    courseType: columns.courseType,
    time: columns.time,
    dates: columns.dates,
  }).filter(([, index]) => index < 0).map(([key]) => requiredHeaderLabels[key as keyof typeof requiredHeaderLabels]);
  if (requiredHeaders.length > 0) throw new Error(`Excel 缺少必要欄位：${requiredHeaders.join("、")}`);

  const rows: ImportRow[] = [];
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const values = row.values as unknown[];
    const schoolName = clean(values[columns.schoolName]);
    const address = clean(values[columns.address]);
    const courseType = clean(values[columns.courseType]);
    const dateRaw = clean(values[columns.dates]);
    const rawType = optionalValue(values, columns.type);
    const rawRegion = clean(values[columns.region]);
    const timeRaw = clean(values[columns.time]);
    const teacherName = optionalValue(values, columns.teacher);
    const assistantTeacherName = optionalValue(values, columns.assistantTeacher);
    const payrollHoursRaw = optionalValue(values, columns.payrollHours);
    const category = normalizeCategory(optionalValue(values, columns.category) || CAMP_CATEGORY);
    const notes = optionalValue(values, columns.notes);
    if (![schoolName, address, courseType, dateRaw, rawType, rawRegion, timeRaw, teacherName, assistantTeacherName, payrollHoursRaw, category, notes].some(Boolean)) return;

    const missingFields = [
      !schoolName ? "園所名稱" : "",
      !address ? "地址" : "",
      !courseType ? "課程項目" : "",
      !dateRaw ? "日期" : "",
      !timeRaw ? "上課時間" : "",
    ].filter(Boolean);
    const parsedDates = parseSummerDates(dateRaw, year);
    const parsedTime = normalizeTime(timeRaw);
    const parsedPayrollHours = parsePayrollHours(payrollHoursRaw);
    const estimatedHours = attendanceHoursFromCourseTime(parsedTime.time);

    rows.push({
      rowNumber,
      schoolName,
      type: rawType || CAMP_DEPARTMENT,
      address,
      region: normalizeRegion(rawRegion),
      courseType,
      timeRaw,
      time: parsedTime.time,
      dateRaw,
      dates: parsedDates.dates,
      dateErrors: parsedDates.errors,
      teacherName,
      assistantTeacherName,
      payrollHoursRaw,
      payrollHours: parsedPayrollHours ?? estimatedHours.hours,
      category,
      notes,
      timeNeedsReview: parsedTime.needsReview || (!parsedPayrollHours && estimatedHours.needsReview),
      missingFields,
    });
  });
  return rows;
}

function findExistingSchool(row: ImportRow, schools: ExistingSchool[]) {
  const exact = schools.find((school) => schoolKey(school.name, school.address) === schoolKey(row.schoolName, row.address));
  if (exact) return { school: exact, conflict: false };
  const sameName = schools.find((school) => compact(school.name) === compact(row.schoolName));
  return { school: sameName ?? null, conflict: Boolean(sameName && compact(sameName.address) !== compact(row.address)) };
}

function teacherMap(teachers: ExistingTeacher[]) {
  return new Map(teachers.map((teacher) => [compact(teacher.name).toLowerCase(), teacher]));
}

function isEmptyAssistantName(name: string) {
  const value = compact(name).toLowerCase();
  return !value || ["--無助教--", "無助教", "沒有", "無", "none", "null", "-"].includes(value);
}

function resolveTeacher(name: string, teachers: Map<string, ExistingTeacher>, waitingTeacher: ExistingTeacher) {
  if (!name.trim()) return { teacher: waitingTeacher, missing: false };
  const teacher = teachers.get(compact(name).toLowerCase());
  return { teacher: teacher ?? waitingTeacher, missing: !teacher };
}

function resolveAssistant(name: string, teachers: Map<string, ExistingTeacher>) {
  if (isEmptyAssistantName(name)) return { teacher: null, missing: false };
  const teacher = teachers.get(compact(name).toLowerCase()) ?? null;
  return { teacher, missing: !teacher };
}

function findMatchingCourse(row: Pick<ImportRow, "schoolName" | "address" | "courseType" | "time" | "category">, schools: ExistingSchool[], courses: ExistingCourse[]) {
  return courses.find((course) => sameCourseIdentity(row, course, schools)) ?? null;
}

function findAttendance(course: ExistingCourse | null, date: string) {
  return course?.attendances?.find((attendance) => attendance.date.toISOString().slice(0, 10) === date) ?? null;
}

function overwriteBlockReasons(attendance: NonNullable<ReturnType<typeof findAttendance>>) {
  const reasons: string[] = [];
  if (attendance.reportContent.trim()) reasons.push("已回報");
  if (attendance.isPayrollLocked) reasons.push("已鎖薪資");
  if (attendance.reportSentAt || attendance.schoolNotifiedAt || (attendance.schoolNotifyStatus && attendance.schoolNotifyStatus !== "未通知")) reasons.push("已轉發給園所");
  if (attendance.substitutes.length > 0) reasons.push("已有正式代課紀錄");
  if (attendance.cancelled) reasons.push("已取消 / 停課");
  return reasons;
}

function makeDryRun(
  rows: ImportRow[],
  schools: ExistingSchool[],
  courses: ExistingCourse[],
  teachers: ExistingTeacher[],
  waitingTeacher: ExistingTeacher,
  year: number,
  importMode: SummerCampImportMode,
): SummerCampDryRun {
  const newSchoolMap = new Map<string, { name: string; address: string; region: string }>();
  const updateSchoolMap = new Map<number, { id: number; name: string; address: string; updates: Set<string> }>();
  const groupMap = new Map<string, SummerCampDryRun["courseGroups"][number]>();
  const duplicates: SummerCampDryRun["duplicates"] = [];
  const dateErrors: SummerCampDryRun["dateErrors"] = [];
  const timeNeedsReview: SummerCampDryRun["timeNeedsReview"] = [];
  const missingFields: SummerCampDryRun["missingFields"] = [];
  const schoolConflicts: SummerCampDryRun["schoolConflicts"] = [];
  const actions: SummerCampImportAction[] = [];
  const teacherWarnings: SummerCampDryRun["teacherWarnings"] = [];
  const seenAttendance = new Map<string, { rowNumbers: number[]; row: ImportRow }>();
  const excelSchoolAddresses = new Map<string, string>();
  const teachersByName = teacherMap(teachers);

  for (const row of rows) {
    if (row.missingFields.length > 0) missingFields.push({ rowNumber: row.rowNumber, fields: row.missingFields });
    if (row.dateErrors.length > 0) dateErrors.push({ rowNumber: row.rowNumber, value: row.dateRaw, errors: row.dateErrors });
    if (row.timeNeedsReview) timeNeedsReview.push({ rowNumber: row.rowNumber, value: row.timeRaw || row.payrollHoursRaw, reason: "時間格式不完整或計薪時數需人工確認" });

    const compactSchoolName = compact(row.schoolName);
    const existingExcelAddress = excelSchoolAddresses.get(compactSchoolName);
    let excelSchoolConflict = false;
    if (compactSchoolName && existingExcelAddress && existingExcelAddress !== compact(row.address)) {
      excelSchoolConflict = true;
      schoolConflicts.push({
        rowNumber: row.rowNumber,
        name: row.schoolName,
        address: row.address,
        existingAddress: existingExcelAddress,
        reason: "Excel 內同園所名稱但地址不同，需人工確認",
      });
    } else if (compactSchoolName && row.address) {
      excelSchoolAddresses.set(compactSchoolName, compact(row.address));
    }

    const schoolResult = findExistingSchool(row, schools);
    if (schoolResult.conflict && schoolResult.school) {
      schoolConflicts.push({
        rowNumber: row.rowNumber,
        name: row.schoolName,
        address: row.address,
        existingAddress: schoolResult.school.address,
        reason: "同園所名稱但地址不同，需人工確認，避免撞到 School.name 唯一限制",
      });
    } else if (!schoolResult.school && row.schoolName && row.address) {
      newSchoolMap.set(schoolKey(row.schoolName, row.address), { name: row.schoolName, address: row.address, region: row.region });
    } else if (schoolResult.school) {
      const updates = new Set<string>();
      if (!schoolResult.school.type) updates.add("類型=安親班");
      if (!schoolResult.school.region && row.region) updates.add(`地區=${row.region}`);
      if (!schoolResult.school.address && row.address) updates.add("地址");
      if (updates.size > 0) updateSchoolMap.set(schoolResult.school.id, { id: schoolResult.school.id, name: schoolResult.school.name, address: schoolResult.school.address, updates });
    }

    if (row.missingFields.length > 0 || row.dateErrors.length > 0 || schoolResult.conflict || excelSchoolConflict || row.dates.length === 0) continue;

    const resolvedMain = resolveTeacher(row.teacherName, teachersByName, waitingTeacher);
    const resolvedAssistant = resolveAssistant(row.assistantTeacherName, teachersByName);
    if (resolvedMain.missing) {
      teacherWarnings.push({ rowNumber: row.rowNumber, field: "主教老師", name: row.teacherName, fallback: WAITING_TEACHER_NAME });
    }
    if (resolvedAssistant.missing) {
      teacherWarnings.push({ rowNumber: row.rowNumber, field: "助教老師", name: row.assistantTeacherName, fallback: "無助教" });
    }

    const key = courseKey(row);
    const group = groupMap.get(key) ?? {
      key,
      schoolName: row.schoolName,
      address: row.address,
      courseType: row.courseType,
      time: row.time,
      category: row.category,
      teacherName: resolvedMain.teacher.name,
      assistantTeacherName: resolvedAssistant.teacher?.name ?? "",
      payrollHours: row.payrollHours,
      notes: row.notes,
      dates: [],
      rowNumbers: [],
      timeNeedsReview: false,
    };
    group.dates = [...new Set([...group.dates, ...row.dates])].sort();
    group.rowNumbers.push(row.rowNumber);
    group.timeNeedsReview = group.timeNeedsReview || row.timeNeedsReview;
    groupMap.set(key, group);

    const existingCourse = findMatchingCourse(row, schools, courses);
    for (const date of row.dates) {
      const attendanceKey = `${key}|${date}`;
      const seen = seenAttendance.get(attendanceKey);
      if (seen) {
        duplicates.push({ rowNumbers: [...seen.rowNumbers, row.rowNumber], reason: "Excel 內同園所/課程/時間/日期/類別重複，正式匯入時會合併略過", schoolName: row.schoolName, address: row.address, courseType: row.courseType, time: row.time, dates: [date] });
        seen.rowNumbers.push(row.rowNumber);
        continue;
      }
      seenAttendance.set(attendanceKey, { rowNumbers: [row.rowNumber], row });

      const existingAttendance = findAttendance(existingCourse, date);
      if (!existingAttendance) {
        actions.push({
          rowNumber: row.rowNumber,
          action: "create",
          reason: "新增出勤",
          schoolName: row.schoolName,
          address: row.address,
          courseType: row.courseType,
          date,
          time: row.time,
          category: row.category,
          teacherName: row.teacherName,
          resolvedTeacherName: resolvedMain.teacher.name,
          assistantTeacherName: row.assistantTeacherName,
          resolvedAssistantTeacherName: resolvedAssistant.teacher?.name ?? "",
          payrollHours: row.payrollHours ?? 0,
          existingCourseId: existingCourse?.id,
          safeToOverwrite: true,
          safetyReasons: [],
        });
        continue;
      }

      duplicates.push({ rowNumbers: [row.rowNumber], reason: "資料庫已有相同園所/課程/日期/時間/部門/類別", schoolName: row.schoolName, address: row.address, courseType: row.courseType, time: row.time, dates: [date] });
      const safetyReasons = overwriteBlockReasons(existingAttendance);
      if (importMode === "skip") {
        actions.push({
          rowNumber: row.rowNumber,
          action: "skip",
          reason: "已存在，略過",
          schoolName: row.schoolName,
          address: row.address,
          courseType: row.courseType,
          date,
          time: row.time,
          category: row.category,
          teacherName: row.teacherName,
          resolvedTeacherName: resolvedMain.teacher.name,
          assistantTeacherName: row.assistantTeacherName,
          resolvedAssistantTeacherName: resolvedAssistant.teacher?.name ?? "",
          payrollHours: row.payrollHours ?? 0,
          existingAttendanceId: existingAttendance.id,
          existingCourseId: existingCourse?.id,
          safeToOverwrite: safetyReasons.length === 0,
          safetyReasons,
        });
      } else if (safetyReasons.length > 0) {
        actions.push({
          rowNumber: row.rowNumber,
          action: "blocked",
          reason: safetyReasons.join("、"),
          schoolName: row.schoolName,
          address: row.address,
          courseType: row.courseType,
          date,
          time: row.time,
          category: row.category,
          teacherName: row.teacherName,
          resolvedTeacherName: resolvedMain.teacher.name,
          assistantTeacherName: row.assistantTeacherName,
          resolvedAssistantTeacherName: resolvedAssistant.teacher?.name ?? "",
          payrollHours: row.payrollHours ?? 0,
          existingAttendanceId: existingAttendance.id,
          existingCourseId: existingCourse?.id,
          safeToOverwrite: false,
          safetyReasons,
        });
      } else {
        actions.push({
          rowNumber: row.rowNumber,
          action: "overwrite",
          reason: "符合安全條件，可覆蓋",
          schoolName: row.schoolName,
          address: row.address,
          courseType: row.courseType,
          date,
          time: row.time,
          category: row.category,
          teacherName: row.teacherName,
          resolvedTeacherName: resolvedMain.teacher.name,
          assistantTeacherName: row.assistantTeacherName,
          resolvedAssistantTeacherName: resolvedAssistant.teacher?.name ?? "",
          payrollHours: row.payrollHours ?? 0,
          existingAttendanceId: existingAttendance.id,
          existingCourseId: existingCourse?.id,
          safeToOverwrite: true,
          safetyReasons: [],
        });
      }
    }
  }

  const courseGroups = [...groupMap.values()];
  const skippedDuplicates = actions.filter((action) => action.action === "skip");
  const blockedOverwrites = actions.filter((action) => action.action === "blocked");
  const createdAttendances = actions.filter((action) => action.action === "create").length;
  const overwrittenAttendances = actions.filter((action) => action.action === "overwrite").length;
  return {
    ok: dateErrors.length === 0 && missingFields.length === 0 && schoolConflicts.length === 0,
    year,
    importMode,
    summary: {
      totalRows: rows.length,
      validRows: rows.filter((row) => row.missingFields.length === 0 && row.dateErrors.length === 0).length,
      newSchools: newSchoolMap.size,
      updateSchools: updateSchoolMap.size,
      newCourses: courseGroups.filter((group) => !findMatchingCourse(group, schools, courses)).length,
      newAttendanceDates: createdAttendances,
      duplicates: duplicates.length,
      dateErrors: dateErrors.length,
      timeNeedsReview: timeNeedsReview.length,
      missingFields: missingFields.length,
      schoolConflicts: schoolConflicts.length,
      createdAttendances,
      overwrittenAttendances,
      skippedDuplicates: skippedDuplicates.length,
      missingTeachers: teacherWarnings.length,
      blockedOverwrites: blockedOverwrites.length,
      errors: dateErrors.length + missingFields.length + schoolConflicts.length,
    },
    rows,
    newSchools: [...newSchoolMap.values()],
    updateSchools: [...updateSchoolMap.values()].map((item) => ({ ...item, updates: [...item.updates] })),
    courseGroups,
    actions,
    teacherWarnings,
    blockedOverwrites,
    skippedDuplicates,
    duplicates,
    dateErrors,
    timeNeedsReview,
    missingFields,
    schoolConflicts,
  };
}

async function lookup(db: PrismaClient) {
  const [schools, courses, teachers] = await Promise.all([
    db.school.findMany({ select: { id: true, name: true, type: true, region: true, address: true } }),
    db.course.findMany({
      where: { department: CAMP_DEPARTMENT },
      select: {
        id: true,
        schoolId: true,
        school: true,
        courseType: true,
        time: true,
        department: true,
        category: true,
        teacherId: true,
        assistantTeacherId: true,
        attendances: {
          select: {
            id: true,
            date: true,
            actualTeacherId: true,
            assistantTeacherId: true,
            isPayrollLocked: true,
            reportContent: true,
            reportSentAt: true,
            schoolNotifiedAt: true,
            schoolNotifyStatus: true,
            cancelled: true,
            substitutes: { select: { id: true, role: true } },
          },
        },
      },
    }),
    db.teacher.findMany({ select: { id: true, name: true } }),
  ]);
  let waitingTeacher = teachers.find((teacher) => teacher.name === WAITING_TEACHER_NAME);
  if (!waitingTeacher) {
    waitingTeacher = await db.teacher.create({
      data: {
        name: WAITING_TEACHER_NAME,
        notes: "系統建立，用於安親班暑期課程匯入後待排老師。",
      },
      select: { id: true, name: true },
    });
    teachers.push(waitingTeacher);
  }
  return { schools, courses, teachers, waitingTeacher };
}

export async function dryRunSummerCampImport(file: File, year: number, importMode: SummerCampImportMode = "skip", db: PrismaClient = prisma): Promise<SummerCampDryRun> {
  const rows = await parseWorkbook(file, year);
  const { schools, courses, teachers, waitingTeacher } = await lookup(db);
  return makeDryRun(rows, schools, courses, teachers, waitingTeacher, year, importMode);
}

export async function importSummerCamp(file: File, year: number, importMode: SummerCampImportMode = "skip", db: PrismaClient = prisma): Promise<SummerCampImportResult> {
  const dryRun = await dryRunSummerCampImport(file, year, importMode, db);
  if (!dryRun.ok) return dryRun;
  await ensureCoursePayrollHoursColumn();

  const imported = await db.$transaction(async (tx) => {
    const waitingTeacher = await tx.teacher.findUnique({ where: { name: WAITING_TEACHER_NAME }, select: { id: true, name: true } })
      ?? await tx.teacher.create({
        data: {
          name: WAITING_TEACHER_NAME,
          notes: "系統建立，用於安親班暑期課程匯入後待排老師。",
        },
        select: { id: true, name: true },
      });
    const teachers = await tx.teacher.findMany({ select: { id: true, name: true } });
    const teachersByName = teacherMap(teachers);
    const allCodes = (await tx.course.findMany({ select: { code: true } })).map((row) => row.code);
    let nextCode = nextCourseCode(allCodes);
    const takeCode = () => {
      const code = nextCode;
      const match = code.match(/^C(\d+)$/);
      nextCode = `C${String(Number(match?.[1] ?? "0") + 1).padStart(3, "0")}`;
      return code;
    };

    let schoolsCreated = 0;
    let schoolsUpdated = 0;
    let coursesCreated = 0;
    let coursesUpdated = 0;
    let attendancesCreated = 0;
    let attendancesUpdated = 0;
    let attendancesSkipped = 0;
    let blockedOverwrites = 0;
    const stampedCourses: Array<{ courseId: number; dates: string[]; time: string }> = [];

    const schools = await tx.school.findMany({ select: { id: true, name: true, type: true, region: true, address: true } });
    const knownSchools = [...schools];
    const schoolByKey = new Map(schools.map((school) => [schoolKey(school.name, school.address), school]));

    for (const item of dryRun.newSchools) {
      const created = await tx.school.create({
        data: { name: item.name, type: CAMP_DEPARTMENT, region: normalizeRegion(item.region), address: item.address },
      });
      schoolByKey.set(schoolKey(created.name, created.address), created);
      knownSchools.push(created);
      schoolsCreated++;
    }

    for (const item of dryRun.updateSchools) {
      const school = schools.find((row) => row.id === item.id);
      if (!school) continue;
      const data: { type?: string; region?: string; address?: string } = {};
      if (!school.type) data.type = CAMP_DEPARTMENT;
      if (!school.region) {
        const source = dryRun.rows.find((row) => compact(row.schoolName) === compact(school.name) && row.region);
        if (source) data.region = source.region;
      }
      if (!school.address) {
        const source = dryRun.rows.find((row) => compact(row.schoolName) === compact(school.name) && row.address);
        if (source) data.address = source.address;
      }
      if (Object.keys(data).length > 0) {
        const updated = await tx.school.update({ where: { id: item.id }, data });
        schoolByKey.set(schoolKey(updated.name, updated.address), updated);
        const index = knownSchools.findIndex((row) => row.id === updated.id);
        if (index >= 0) knownSchools[index] = updated;
        else knownSchools.push(updated);
        schoolsUpdated++;
      }
    }

    const coursesForMatching: Array<Pick<ExistingCourse, "id" | "schoolId" | "school" | "courseType" | "time" | "department" | "category"> & { time: string }> = [];
    const courseByKey = new Map<string, { id: number; time: string }>();
    const existingCourses = await tx.course.findMany({
      where: { department: CAMP_DEPARTMENT },
      select: { id: true, schoolId: true, school: true, courseType: true, time: true, department: true, category: true },
    });
    coursesForMatching.push(...existingCourses);

    for (const group of dryRun.courseGroups) {
      const school = schoolByKey.get(schoolKey(group.schoolName, group.address));
      const row = dryRun.rows.find((item) => item.rowNumber === group.rowNumbers[0]);
      const resolvedMain = resolveTeacher(row?.teacherName ?? group.teacherName, teachersByName, waitingTeacher);
      const resolvedAssistant = resolveAssistant(row?.assistantTeacherName ?? group.assistantTeacherName, teachersByName);
      const key = `${schoolKey(group.schoolName, group.address)}|${compact(group.courseType)}|${compact(group.time)}|${CAMP_DEPARTMENT}|${compact(group.category)}`;
      let course = courseByKey.get(key) ?? coursesForMatching.find((item) => sameCourseIdentity(group, item, knownSchools));
      const updateData = {
        region: school?.region ?? row?.region ?? "",
        teacherId: resolvedMain.teacher.id,
        assistantTeacherId: resolvedAssistant.teacher?.id ?? null,
        school: group.schoolName,
        schoolId: school?.id ?? null,
        courseType: group.courseType,
        address: group.address,
        dayOfWeek: group.dates[0] ? weekdayOfIso(group.dates[0]) : "",
        recurrenceType: "multiple",
        startDate: group.dates[0] ? parseAttendanceDay(group.dates[0]) : null,
        endDate: group.dates[group.dates.length - 1] ? parseAttendanceDay(group.dates[group.dates.length - 1]) : null,
        weekday: [...new Set(group.dates.map(weekdayOfIso))].join(","),
        time: group.time,
        category: group.category,
        department: CAMP_DEPARTMENT,
        enrollCount: "",
        isActive: true,
        notes: group.notes || (group.timeNeedsReview ? "暑期課程批次匯入；上課時間需人工確認" : "暑期課程批次匯入"),
      };
      if (!course) {
        const created = await tx.course.create({
          data: { code: takeCode(), ...updateData },
          select: { id: true, time: true },
        });
        course = created;
        courseByKey.set(key, course);
        coursesForMatching.push({
          id: course.id,
          schoolId: school?.id ?? null,
          school: group.schoolName,
          courseType: group.courseType,
          time: group.time,
          department: CAMP_DEPARTMENT,
          category: group.category,
        });
        coursesCreated++;
        await tx.$executeRawUnsafe('UPDATE "Course" SET "payrollHours" = ? WHERE "id" = ?', group.payrollHours, course.id);
      } else if (importMode === "overwrite") {
        const updated = await tx.course.update({ where: { id: course.id }, data: updateData, select: { id: true, time: true } });
        course = updated;
        courseByKey.set(key, updated);
        const index = coursesForMatching.findIndex((item) => item.id === updated.id);
        const updatedCourse = {
          id: updated.id,
          schoolId: school?.id ?? null,
          school: group.schoolName,
          courseType: group.courseType,
          time: group.time,
          department: CAMP_DEPARTMENT,
          category: group.category,
        };
        if (index >= 0) coursesForMatching[index] = updatedCourse;
        else coursesForMatching.push(updatedCourse);
        coursesUpdated++;
        await tx.$executeRawUnsafe('UPDATE "Course" SET "payrollHours" = ? WHERE "id" = ?', group.payrollHours, updated.id);
      }
    }

    const actionsByKey = new Map(dryRun.actions.map((action) => [`${action.schoolName}|${action.address}|${action.courseType}|${action.date}|${action.time}|${action.category}|${action.rowNumber}`, action]));
    for (const row of dryRun.rows) {
      if (row.missingFields.length > 0 || row.dateErrors.length > 0 || row.dates.length === 0) continue;
      const group = dryRun.courseGroups.find((item) => item.key === courseKey(row));
      if (!group) continue;
      const course = courseByKey.get(`${schoolKey(row.schoolName, row.address)}|${compact(row.courseType)}|${compact(row.time)}|${CAMP_DEPARTMENT}|${compact(row.category)}`)
        ?? coursesForMatching.find((item) => sameCourseIdentity(row, item, knownSchools));
      if (!course) continue;
      const resolvedMain = resolveTeacher(row.teacherName, teachersByName, waitingTeacher);
      const resolvedAssistant = resolveAssistant(row.assistantTeacherName, teachersByName);
      const hours = row.payrollHours ?? attendanceHoursFromCourseTime(row.time).hours;
      for (const date of row.dates) {
        const action = actionsByKey.get(`${row.schoolName}|${row.address}|${row.courseType}|${date}|${row.time}|${row.category}|${row.rowNumber}`);
        if (!action) {
          attendancesSkipped++;
          continue;
        }
        if (action.action === "skip") {
          attendancesSkipped++;
          continue;
        }
        if (action.action === "blocked") {
          blockedOverwrites++;
          continue;
        }
        const attendanceData = {
          actualTeacherId: resolvedMain.teacher.id,
          assistantTeacherId: resolvedAssistant.teacher?.id ?? null,
          category: row.category,
          hours,
          notes: row.notes || (row.timeNeedsReview ? "暑期課程批次匯入；上課時間或計薪時數需人工確認" : ""),
        };
        if (action.action === "overwrite" && action.existingAttendanceId) {
          await tx.attendance.update({
            where: { id: action.existingAttendanceId },
            data: attendanceData,
          });
          attendancesUpdated++;
        } else if (action.action === "create") {
          await tx.attendance.create({
            data: {
              date: parseAttendanceDay(date),
              courseId: course.id,
              ...attendanceData,
              studentCount: null,
              cancelled: false,
              cancelReason: "",
              makeupDate: null,
              makeupDone: false,
            },
          });
          attendancesCreated++;
        }
        stampedCourses.push({ courseId: course.id, dates: [date], time: row.time });
      }
    }

    return {
      schoolsCreated,
      schoolsUpdated,
      coursesCreated,
      coursesUpdated,
      attendancesCreated,
      attendancesUpdated,
      attendancesSkipped,
      blockedOverwrites,
      missingTeachers: dryRun.teacherWarnings.length,
      errors: dryRun.summary.errors,
      stampedCourses,
    };
  }, { maxWait: 10000, timeout: 120000 });

  for (const stamp of imported.stampedCourses) {
    await stampAttendanceTime(stamp.courseId, stamp.dates, stamp.time).catch(() => undefined);
  }

  const { stampedCourses: _stampedCourses, ...publicImported } = imported;
  void _stampedCourses;
  return { ...dryRun, imported: publicImported };
}

export { WAITING_TEACHER_NAME, CAMP_CATEGORY, CAMP_DEPARTMENT };
