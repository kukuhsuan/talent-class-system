import { prisma } from "@/lib/prisma";
import { courseLabel, COURSE_OPTIONS } from "@/lib/courseMeta";
import { weekdayOfIso } from "@/lib/courseDates";
import { effectiveAttendanceTime, usableScheduledTime } from "@/lib/attendanceTime";
import { readSheetValues, readSpreadsheetSheetNames, writeHighlightedSheetValue } from "@/lib/googleSheetsClient";

type SheetMetadata = Awaited<ReturnType<typeof readSpreadsheetSheetNames>>;
type SheetRows = Awaited<ReturnType<typeof readSheetValues>>;

type SheetSyncCache = {
  sheetMetadata?: Promise<SheetMetadata>;
  rowsBySheet: Map<string, Promise<SheetRows>>;
};

function createSheetSyncCache(): SheetSyncCache {
  return { rowsBySheet: new Map() };
}

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

// 試算表使用的園所簡稱 ↔ 系統正式名稱。兩邊都加入候選值，因此不論資料庫或
// 試算表哪一側使用簡稱，都能先以園所對照命中，再核對項目、星期與時間。
const SCHOOL_NAME_ALIASES: ReadonlyArray<readonly [string, string]> = [
  ["新南", "何嘉仁新南幼兒園"],
  ["臨沂", "何嘉仁臨沂幼兒園"],
  ["林口勁寶兒", "林口勁寶兒幼兒園"],
  ["淡水何", "何嘉仁國際幼兒園-淡水"],
  ["清福", "清福幼兒園"],
  ["文心", "文心幼兒園"],
  ["千愛", "千愛幼兒園"],
  ["艾倫戴爾", "艾倫戴爾"],
  ["喬米", "喬米幼兒園"],
  ["二重", "二重幼兒園"],
  ["輔仁", "苗栗輔仁幼兒園"],
  ["艾丁堡", "艾丁堡幼兒園"],
  ["快樂地", "新竹快樂地幼兒園"],
  ["科蔓", "竹科蔓幼兒園"],
  ["大甲熊", "熊寶寶幼兒園"],
  ["明典", "明典幼兒園"],
  ["葳格", "葳格幼兒園"],
  ["大甲何", "何嘉仁大甲幼校"],
  ["好兒美", "好兒美幼兒園"],
  ["安心", "安心幼兒園"],
  ["馬克", "台中市私立馬克幼兒園"],
  ["小叮噹", "小叮噹幼兒園"],
  ["清水馬丁", "台中市私立馬丁幼兒園"],
  ["有志", "私立有志幼兒園"],
  ["哈拿", "哈拿幼兒園"],
  ["哈利", "私立哈利準公共幼兒園"],
  ["漢家", "漢家幼兒園"],
  ["葛雷妮", "葛蕾尼藝術人文幼兒園"],
  ["東園何", "東園何嘉仁幼兒園"],
  ["福斯", "臺中市私立福瑞斯特藝術幼兒園"],
  ["頂尖", "彰化縣私立頂尖保進幼兒園"],
  ["仁保", "仁武保進幼兒園"],
  ["松保", "中和松柏幼兒園"],
  ["開普保", "臺中市私立開普敦幼兒園"],
];

function schoolCandidates(school: string, item: string) {
  const normalizedSchool = normalize(school);
  const values = new Set([normalizedSchool]);
  const suffixes = [`(${item})`, `（${item}）`].map(normalize);
  for (const suffix of suffixes) if (normalizedSchool.endsWith(suffix)) values.add(normalizedSchool.slice(0, -suffix.length));

  for (const [shortName, fullName] of SCHOOL_NAME_ALIASES) {
    const normalizedShortName = normalize(shortName);
    const normalizedFullName = normalize(fullName);
    if (values.has(normalizedShortName) || values.has(normalizedFullName)) {
      values.add(normalizedShortName);
      values.add(normalizedFullName);
    }
  }

  // 試算表常以園所簡稱登記，例如系統「何嘉仁臨沂幼兒園」、表內「臨沂」。
  // 只產生去除行政／品牌／機構字樣後的明確簡稱，後續仍須同時吻合課程、星期與時間。
  for (const candidate of [...values]) {
    const withoutRegion = candidate.replace(/^(?:台北市|新北市|桃園市|台中市|新竹市|高雄市|基隆市|彰化縣|新竹縣|苗栗縣)?(?:私立|市立|縣立)?/, "");
    values.add(withoutRegion);
    const withoutKindergarten = withoutRegion.replace(/(?:幼兒園|幼稚園|幼校)$/, "");
    values.add(withoutKindergarten);
    if (withoutKindergarten.startsWith("何嘉仁") && withoutKindergarten.length > 3) {
      values.add(withoutKindergarten.slice(3));
    }
  }
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

async function resolveSheetName(spreadsheetId: string, dateIso: string, cache?: SheetSyncCache) {
  const yearMonth = dateIso.slice(0, 7);
  const configured = tabMap()[yearMonth]?.trim();
  if (configured) return configured;
  const year = Number(dateIso.slice(0, 4));
  const month = Number(dateIso.slice(5, 7));
  const exactMonthlyTitle = `${year - 1911}-${month}月`;
  const sheets = cache
    ? await (cache.sheetMetadata ??= readSpreadsheetSheetNames(spreadsheetId))
    : await readSpreadsheetSheetNames(spreadsheetId);
  const matches = sheets.filter((sheet) => !sheet.hidden && sheet.title.trim() === exactMonthlyTitle);
  return matches.length === 1 ? matches[0].title : "";
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
  if (/^\d+(?:\.\d+)?$/.test(text)) return { kind: "count" as const, value: Number(text) };
  const named = text.match(/[（(](\d+(?:\.\d+)?)[）)]\s*$/);
  if (named) return { kind: "count" as const, value: Number(named[1]) };
  return { kind: "other" as const };
}

export async function queueAttendanceSheetSync(attendanceId: number) {
  await saveStatus(attendanceId, SHEET_SYNC_STATUS.pending);
}

export async function syncAttendanceToGoogleSheet(attendanceId: number, cache?: SheetSyncCache) {
  const enabled = process.env.GOOGLE_SHEETS_SYNC_ENABLED === "true";
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID?.trim() ?? "";
  if (!enabled || !spreadsheetId) {
    await saveStatus(attendanceId, SHEET_SYNC_STATUS.skipped, { message: "Google Sheets 同步尚未啟用" });
    return;
  }
  const attendance = await prisma.attendance.findUnique({ where: { id: attendanceId }, include: { course: true } });
  if (!attendance || attendance.cancelled) return;
  const dateIso = attendance.date.toISOString().slice(0, 10);
  let sheetName = "";
  try {
    sheetName = await resolveSheetName(spreadsheetId, dateIso, cache);
    if (!sheetName) {
      await saveStatus(attendanceId, SHEET_SYNC_STATUS.noMatch, { systemValue: attendance.studentCount, message: `找不到唯一且未隱藏的 ${Number(dateIso.slice(0, 4)) - 1911}-${Number(dateIso.slice(5, 7))}月 分頁` });
      return;
    }
    const sheetRange = `'${sheetName.replace(/'/g, "''")}'!A1:AB1200`;
    let rowsPromise = cache?.rowsBySheet.get(sheetName);
    if (!rowsPromise) {
      rowsPromise = readSheetValues(spreadsheetId, sheetRange);
      cache?.rowsBySheet.set(sheetName, rowsPromise);
    }
    const rows = await rowsPromise;
    const header = rows[0] ?? [];
    const indices = { school: header.findIndex((v) => normalize(v) === "學校"), item: header.findIndex((v) => normalize(v) === "項目"), weekday: header.findIndex((v) => normalize(v) === "星期幾"), time: header.findIndex((v) => normalize(v) === "時間") };
    if (Object.values(indices).some((v) => v < 0)) throw new Error("試算表缺少學校／項目／星期幾／時間欄位");
    const time = effectiveAttendanceTime({ scheduledTime: usableScheduledTime(attendance.scheduledTime), courseTime: attendance.course.time, attendanceHours: attendance.hours, isPayrollLocked: attendance.isPayrollLocked, reportContent: attendance.reportContent, reportSentAt: attendance.reportSentAt, studentCount: attendance.studentCount, studentCountA: attendance.studentCountA, studentCountB: attendance.studentCountB });
    const schools = schoolCandidates(attendance.course.school, courseLabel(attendance.course.courseType));
    const items = itemCandidates(attendance.course.courseType);
    const weekday = normalize(weekdayOfIso(dateIso));
    const internalMarkerIndex = rows.findIndex((row) => row.some((value) => normalize(value).includes("課內課")));
    const internalRows = new Set<number>();
    if (internalMarkerIndex >= 0) {
      for (let index = internalMarkerIndex + 1; index < rows.length; index++) {
        const row = rows[index] ?? [];
        const looksLikeInternalCourse = Boolean(normalize(row[2])) && normalize(row[3]).includes(":")
          && Boolean(normalize(row[4])) && normalize(row[5]).startsWith("星期") && Boolean(normalize(row[6]));
        if (!looksLikeInternalCourse) break;
        internalRows.add(index);
      }
    }
    const candidateRows = rows.map((row, index) => {
      const isInternal = internalRows.has(index);
      const rowIndices = isInternal ? { school: 2, time: 3, item: 4, weekday: 5 } : indices;
      return { row, index, isInternal, rowIndices };
    }).filter(({ row, index, rowIndices }) => index > 0
      && items.has(normalize(row[rowIndices.item]))
      && normalize(row[rowIndices.weekday]).replace(/[（(].*$/, "") === weekday && normalize(row[rowIndices.time]) === normalize(time));
    const schoolMatches = candidateRows.filter(({ row, rowIndices }) => schools.has(normalize(row[rowIndices.school])));
    // 園所慣用簡稱未必能由正式全名規則化取得。先採園所吻合的結果；若完全對不上，
    // 才以「項目＋星期＋時間」作唯一性備援。只要出現兩列以上就拒絕寫入，避免猜錯園所。
    const matches = schoolMatches.length > 0 ? schoolMatches : candidateRows.length === 1 ? candidateRows : [];
    if (matches.length !== 1) {
      await saveStatus(attendanceId, SHEET_SYNC_STATUS.noMatch, { sheetName, systemValue: attendance.studentCount, message: `園所符合列數：${schoolMatches.length}；項目／星期／時間符合列數：${candidateRows.length}（不寫入）` });
      return;
    }
    const syncValue = matches[0].isInternal ? attendance.hours : attendance.studentCount;
    if (syncValue == null) {
      await saveStatus(attendanceId, SHEET_SYNC_STATUS.noMatch, { sheetName, message: matches[0].isInternal ? "課內課缺少上課時數" : "一般課程缺少實到人數" });
      return;
    }
    const weekIndex = header.findIndex((value) => weekContains(String(value ?? ""), dateIso));
    if (weekIndex < 0) {
      await saveStatus(attendanceId, SHEET_SYNC_STATUS.noWeek, { sheetName, systemValue: syncValue, message: `${dateIso} 找不到週次欄` });
      return;
    }
    const rowNumber = matches[0].index + 1;
    const cell = `${columnLetter(weekIndex)}${rowNumber}`;
    const existing = matches[0].row[weekIndex];
    const parsed = existingCount(existing);
    if (parsed.kind === "empty") {
      await writeHighlightedSheetValue(spreadsheetId, sheetName, cell, syncValue);
      // 同一輪的其他紀錄會共用這份快取；寫入後同步更新快取，避免再次誤判為空白。
      matches[0].row[weekIndex] = syncValue;
      await saveStatus(attendanceId, SHEET_SYNC_STATUS.synced, { sheetName, cell, systemValue: syncValue, sheetValue: String(existing ?? ""), message: matches[0].isInternal ? "課內課已同步時數" : "已同步實到人數", synced: true });
    } else if (parsed.kind === "count" && parsed.value === syncValue) {
      await saveStatus(attendanceId, SHEET_SYNC_STATUS.same, { sheetName, cell, systemValue: syncValue, sheetValue: String(existing), message: matches[0].isInternal ? "課內課時數一致" : "實到人數一致", synced: true });
    } else {
      await saveStatus(attendanceId, SHEET_SYNC_STATUS.conflict, { sheetName, cell, systemValue: syncValue, sheetValue: String(existing), message: "Google Sheet 已有不同內容，未覆蓋" });
    }
  } catch (error) {
    await saveStatus(attendanceId, SHEET_SYNC_STATUS.error, { sheetName, systemValue: attendance.studentCount, message: error instanceof Error ? error.message.slice(0, 500) : "未知錯誤" });
    throw error;
  }
}

export async function retryPendingAttendanceSheetSync(limit = 200) {
  await ensureTable();
  // 待同步／失敗／衝突優先，其次先複查最近 45 天的課程，再輪流檢查歷史紀錄。
  // 同一分頁只讀取一次，因此可以在一輪內安全檢查更多筆，不會為每堂課重複讀整張表。
  const rows = await prisma.$queryRawUnsafe<Array<{ attendanceId: number }>>(
    `SELECT s."attendanceId" FROM "AttendanceSheetSync" s
     LEFT JOIN "Attendance" a ON a."id" = s."attendanceId"
     WHERE s."status" IN (?,?,?,?,?,?,?)
     ORDER BY
       CASE WHEN s."status" IN (?,?,?,?,?) THEN 0 ELSE 1 END,
       CASE WHEN date(a."date") >= date('now', '-45 days') THEN 0 ELSE 1 END,
       s."updatedAt" ASC
     LIMIT ?`,
    SHEET_SYNC_STATUS.pending,
    SHEET_SYNC_STATUS.error,
    SHEET_SYNC_STATUS.conflict,
    SHEET_SYNC_STATUS.synced,
    SHEET_SYNC_STATUS.same,
    SHEET_SYNC_STATUS.noMatch,
    SHEET_SYNC_STATUS.noWeek,
    SHEET_SYNC_STATUS.pending,
    SHEET_SYNC_STATUS.error,
    SHEET_SYNC_STATUS.conflict,
    SHEET_SYNC_STATUS.noMatch,
    SHEET_SYNC_STATUS.noWeek,
    limit,
  );
  const cache = createSheetSyncCache();
  const results = await Promise.allSettled(rows.map((row) => syncAttendanceToGoogleSheet(Number(row.attendanceId), cache)));
  return { attempted: rows.length, failed: results.filter((item) => item.status === "rejected").length };
}
