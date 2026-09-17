import { prisma } from "@/lib/prisma";
import { courseLabel, COURSE_OPTIONS } from "@/lib/courseMeta";
import { weekdayOfIso } from "@/lib/courseDates";
import { effectiveAttendanceTime, usableScheduledTime } from "@/lib/attendanceTime";
import { readSheetValues, writeSheetValue } from "@/lib/googleSheetsClient";

export const SHEET_SYNC_STATUS = {
  pending: "待同步", synced: "已同步", same: "已一致", conflict: "人數不一致，待核對",
  noMatch: "找不到唯一對應列", noWeek: "找不到週次欄", skipped: "未設定", error: "同步失敗",
} as const;

async function ensureTable() {
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "AttendanceSheetSync" (
    "attendanceId" INTEGER NOT NULL PRIMARY KEY,
    "status" TEXT NOT NULL DEFAULT '待同步', "sheetName" TEXT NOT NULL DEFAULT '',
    "cell" TEXT NOT NULL DEFAULT '', "systemValue" INTEGER, "sheetValue" TEXT NOT NULL DEFAULT '',
    "message" TEXT NOT NULL DEFAULT '', "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" DATETIME, "syncedAt" DATETIME, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
}

async function saveStatus(attendanceId: number, status: string, details: { sheetName?: string; cell?: string; systemValue?: number | null; sheetValue?: string; message?: string; synced?: boolean } = {}) {
  await ensureTable();
  await prisma.$executeRawUnsafe(`INSERT INTO "AttendanceSheetSync"
    ("attendanceId","status","sheetName","cell","systemValue","sheetValue","message","attempts","lastAttemptAt","syncedAt","createdAt","updatedAt")
    VALUES (?,?,?,?,?,?,?,1,CURRENT_TIMESTAMP,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
    ON CONFLICT("attendanceId") DO UPDATE SET "status"=excluded."status","sheetName"=excluded."sheetName",
    "cell"=excluded."cell","systemValue"=excluded."systemValue","sheetValue"=excluded."sheetValue",
    "message"=excluded."message","attempts"="AttendanceSheetSync"."attempts"+1,
    "lastAttemptAt"=CURRENT_TIMESTAMP,"syncedAt"=excluded."syncedAt","updatedAt"=CURRENT_TIMESTAMP`,
    attendanceId, status, details.sheetName ?? "", details.cell ?? "", details.systemValue ?? null,
    details.sheetValue ?? "", details.message ?? "", details.synced ? new Date() : null);
}

function normalize(value: unknown) {
  return String(value ?? "").trim().replace(/[　\s]+/g, "").replace(/[：]/g, ":").replace(/[－–—~～]/g, "-");
}

function schoolCandidates(school: string, item: string) {
  const values = new Set([normalize(school)]);
  const suffixes = [`(${item})`, `（${item}）`].map(normalize);
  for (const suffix of suffixes) if (normalize(school).endsWith(suffix)) values.add(normalize(school).slice(0, -suffix.length));
  return values;
}

function itemCandidates(raw: string) {
  const label = courseLabel(raw);
  const values = new Set([normalize(raw), normalize(label)]);
  for (const option of COURSE_OPTIONS) if (option.label === label) values.add(normalize(option.code));
  return values;
}

function tabMap() {
  try { return JSON.parse(process.env.GOOGLE_SHEETS_TAB_MAP_JSON ?? "{}") as Record<string, string>; }
  catch { return {}; }
}

function columnLetter(index: number) {
  let n = index + 1, out = "";
  while (n > 0) { n--; out = String.fromCharCode(65 + (n % 26)) + out; n = Math.floor(n / 26); }
  return out;
}

function weekContains(header: string, dateIso: string) {
  const match = normalize(header).match(/^(\d{1,2})\/(\d{1,2})-(\d{1,2})\/(\d{1,2})$/);
  if (!match) return false;
  const [, sm, sd, em, ed] = match.map(Number);
  const year = Number(dateIso.slice(0, 4));
  const target = new Date(`${dateIso}T00:00:00Z`).getTime();
  return target >= Date.UTC(year, sm - 1, sd) && target <= Date.UTC(year, em - 1, ed);
}

function existingCount(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text) return { kind: "empty" as const };
  if (/^\d+$/.test(text)) return { kind: "count" as const, value: Number(text) };
  const named = text.match(/[（(](\d+)[）)]\s*$/);
  if (named) return { kind: "count" as const, value: Number(named[1]) };
  return { kind: "other" as const };
}

export async function queueAttendanceSheetSync(attendanceId: number) {
  await saveStatus(attendanceId, SHEET_SYNC_STATUS.pending);
}

export async function syncAttendanceToGoogleSheet(attendanceId: number) {
  const enabled = process.env.GOOGLE_SHEETS_SYNC_ENABLED === "true";
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID?.trim() ?? "";
  if (!enabled || !spreadsheetId) {
    await saveStatus(attendanceId, SHEET_SYNC_STATUS.skipped, { message: "Google Sheets 同步尚未啟用" });
    return;
  }
  const attendance = await prisma.attendance.findUnique({ where: { id: attendanceId }, include: { course: true } });
  if (!attendance || attendance.cancelled || attendance.studentCount == null) return;
  const dateIso = attendance.date.toISOString().slice(0, 10);
  const sheetName = tabMap()[dateIso.slice(0, 7)];
  if (!sheetName) {
    await saveStatus(attendanceId, SHEET_SYNC_STATUS.noMatch, { systemValue: attendance.studentCount, message: `未設定 ${dateIso.slice(0, 7)} 對應分頁` });
    return;
  }
  try {
    const rows = await readSheetValues(spreadsheetId, `'${sheetName.replace(/'/g, "''")}'!A1:AB1200`);
    const header = rows[0] ?? [];
    const indices = { school: header.findIndex((v) => normalize(v) === "學校"), item: header.findIndex((v) => normalize(v) === "項目"), weekday: header.findIndex((v) => normalize(v) === "星期幾"), time: header.findIndex((v) => normalize(v) === "時間") };
    if (Object.values(indices).some((v) => v < 0)) throw new Error("試算表缺少學校／項目／星期幾／時間欄位");
    const time = effectiveAttendanceTime({ scheduledTime: usableScheduledTime(attendance.scheduledTime), courseTime: attendance.course.time, attendanceHours: attendance.hours, isPayrollLocked: attendance.isPayrollLocked, reportContent: attendance.reportContent, reportSentAt: attendance.reportSentAt, studentCount: attendance.studentCount, studentCountA: attendance.studentCountA, studentCountB: attendance.studentCountB });
    const schools = schoolCandidates(attendance.course.school, courseLabel(attendance.course.courseType));
    const items = itemCandidates(attendance.course.courseType);
    const weekday = normalize(weekdayOfIso(dateIso));
    const matches = rows.map((row, index) => ({ row, index })).filter(({ row, index }) => index > 0
      && schools.has(normalize(row[indices.school])) && items.has(normalize(row[indices.item]))
      && normalize(row[indices.weekday]).replace(/[（(].*$/, "") === weekday && normalize(row[indices.time]) === normalize(time));
    if (matches.length !== 1) {
      await saveStatus(attendanceId, SHEET_SYNC_STATUS.noMatch, { sheetName, systemValue: attendance.studentCount, message: `符合列數：${matches.length}（不寫入）` });
      return;
    }
    const weekIndex = header.findIndex((value) => weekContains(String(value ?? ""), dateIso));
    if (weekIndex < 0) {
      await saveStatus(attendanceId, SHEET_SYNC_STATUS.noWeek, { sheetName, systemValue: attendance.studentCount, message: `${dateIso} 找不到週次欄` });
      return;
    }
    const rowNumber = matches[0].index + 1;
    const cell = `${columnLetter(weekIndex)}${rowNumber}`;
    const existing = matches[0].row[weekIndex];
    const parsed = existingCount(existing);
    if (parsed.kind === "empty") {
      await writeSheetValue(spreadsheetId, `'${sheetName.replace(/'/g, "''")}'!${cell}`, attendance.studentCount);
      await saveStatus(attendanceId, SHEET_SYNC_STATUS.synced, { sheetName, cell, systemValue: attendance.studentCount, sheetValue: String(existing ?? ""), synced: true });
    } else if (parsed.kind === "count" && parsed.value === attendance.studentCount) {
      await saveStatus(attendanceId, SHEET_SYNC_STATUS.same, { sheetName, cell, systemValue: attendance.studentCount, sheetValue: String(existing), synced: true });
    } else {
      await saveStatus(attendanceId, SHEET_SYNC_STATUS.conflict, { sheetName, cell, systemValue: attendance.studentCount, sheetValue: String(existing), message: "Google Sheet 已有不同內容，未覆蓋" });
    }
  } catch (error) {
    await saveStatus(attendanceId, SHEET_SYNC_STATUS.error, { sheetName, systemValue: attendance.studentCount, message: error instanceof Error ? error.message.slice(0, 500) : "未知錯誤" });
    throw error;
  }
}

export async function retryPendingAttendanceSheetSync(limit = 30) {
  await ensureTable();
  const rows = await prisma.$queryRawUnsafe<Array<{ attendanceId: number }>>(`SELECT "attendanceId" FROM "AttendanceSheetSync" WHERE "status" IN (?,?) ORDER BY "updatedAt" ASC LIMIT ?`, SHEET_SYNC_STATUS.pending, SHEET_SYNC_STATUS.error, limit);
  const results = await Promise.allSettled(rows.map((row) => syncAttendanceToGoogleSheet(Number(row.attendanceId))));
  return { attempted: rows.length, failed: results.filter((item) => item.status === "rejected").length };
}
