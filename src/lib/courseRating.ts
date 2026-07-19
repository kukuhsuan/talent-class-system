import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { courseLabel } from "@/lib/courseMeta";
import { raiseSystemAlert } from "@/lib/systemAlerts";

// 安親班課程評分：每堂課產生專屬評分連結，安親班免登入填寫，一堂課一次評分。

export const RATING_FIELDS = [
  { key: "scorePunctuality", label: "準時與課前準備" },
  { key: "scoreTeaching", label: "教學內容與專業" },
  { key: "scoreOrder", label: "課堂帶領與秩序" },
  { key: "scoreInteraction", label: "與孩子的互動" },
  { key: "scoreOverall", label: "整體課程滿意度" },
] as const;

// 相容舊資料：資料庫仍可能存在「願意／需要再觀察／不建議」
export const CONTINUE_WISH_OPTIONS = ["願意繼續安排", "仍需觀察", "暫不安排"] as const;

let tablesReady = false;
export async function ensureCourseRatingTables() {
  if (tablesReady) return;
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS CourseRating (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      attendanceId INTEGER NOT NULL UNIQUE,
      token TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'open',
      scorePunctuality INTEGER NOT NULL DEFAULT 0,
      scoreTeaching INTEGER NOT NULL DEFAULT 0,
      scoreOrder INTEGER NOT NULL DEFAULT 0,
      scoreInteraction INTEGER NOT NULL DEFAULT 0,
      scoreOverall INTEGER NOT NULL DEFAULT 0,
      feedback TEXT NOT NULL DEFAULT '',
      continueWish TEXT NOT NULL DEFAULT '',
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      submittedAt DATETIME
    )
  `);
  tablesReady = true;
}

export type CourseRatingRow = {
  id: number;
  attendanceId: number;
  token: string;
  status: string; // open / submitted / closed
  scorePunctuality: number;
  scoreTeaching: number;
  scoreOrder: number;
  scoreInteraction: number;
  scoreOverall: number;
  feedback: string;
  continueWish: string;
  createdAt: string;
  submittedAt: string | null;
};

// raw 查詢的 INTEGER 會是 BigInt，統一轉 number 避免 JSON 序列化錯誤
export function normalizeRatingRow(row: CourseRatingRow): CourseRatingRow {
  return {
    ...row,
    id: Number(row.id),
    attendanceId: Number(row.attendanceId),
    scorePunctuality: Number(row.scorePunctuality),
    scoreTeaching: Number(row.scoreTeaching),
    scoreOrder: Number(row.scoreOrder),
    scoreInteraction: Number(row.scoreInteraction),
    scoreOverall: Number(row.scoreOverall),
  };
}

export function isAfterSchool(department: string | null | undefined): boolean {
  return String(department ?? "").includes("安親");
}

// 評分連結上顯示的課堂資訊（安親班名稱、課程名稱、日期、老師、課程編號）
export type RatingLessonInfo = {
  attendanceId: number;
  school: string;
  courseName: string;
  courseCode: string;
  date: string; // YYYY-MM-DD
  teacherName: string;
  kindergarten: boolean; // 幼兒園課程改用 WaysLeader 品牌顯示
};

export async function ratingLessonInfo(attendanceId: number): Promise<RatingLessonInfo | null> {
  // 評分已開放幼兒園，這裡不再限制安親班；token 存在即代表這堂課有評分任務
  const attendance = await prisma.attendance.findUnique({
    where: { id: attendanceId },
    include: { course: true, actualTeacher: true },
  });
  if (!attendance) return null;
  return {
    attendanceId: attendance.id,
    school: attendance.course.school,
    courseName: courseLabel(attendance.course.courseType), // 課程代碼轉中文名稱（FT → 足球）
    courseCode: attendance.course.code,
    date: attendance.date.toISOString().slice(0, 10),
    teacherName: attendance.actualTeacher?.name ?? "",
    kindergarten: !isAfterSchool(attendance.course.department),
  };
}

// 取得或建立評分連結（同一堂課共用同一個 token）
export async function getOrCreateRating(attendanceId: number): Promise<CourseRatingRow> {
  await ensureCourseRatingTables();
  const existing = await prisma.$queryRawUnsafe<CourseRatingRow[]>(
    "SELECT * FROM CourseRating WHERE attendanceId = ?", attendanceId,
  );
  if (existing.length) return normalizeRatingRow(existing[0]);
  const token = crypto.randomBytes(24).toString("base64url");
  await prisma.$executeRawUnsafe(
    "INSERT OR IGNORE INTO CourseRating (attendanceId, token) VALUES (?, ?)",
    attendanceId, token,
  );
  const rows = await prisma.$queryRawUnsafe<CourseRatingRow[]>(
    "SELECT * FROM CourseRating WHERE attendanceId = ?", attendanceId,
  );
  return normalizeRatingRow(rows[0]);
}

export async function getRatingByToken(token: string): Promise<CourseRatingRow | null> {
  await ensureCourseRatingTables();
  const rows = await prisma.$queryRawUnsafe<CourseRatingRow[]>(
    "SELECT * FROM CourseRating WHERE token = ?", token,
  );
  return rows.length ? normalizeRatingRow(rows[0]) : null;
}

// 整體滿意度 < 3 分 → 開立異常單進待處理中心
export async function raiseLowScoreAlert(attendanceId: number, overall: number, lesson: RatingLessonInfo) {
  await raiseSystemAlert({
    level: "P1",
    category: "安親班評分",
    title: `低分評分：${lesson.school} ${lesson.teacherName} 整體滿意度 ${overall} 分`,
    detail: `${lesson.date}｜${lesson.courseName}（${lesson.courseCode}）老師：${lesson.teacherName}，請儘速了解狀況。`,
    dedupeKey: `course-rating-low:${attendanceId}`,
  });
}

// 由課堂反查園所 id（驗證評分權限用）
export async function ratingSchoolId(attendanceId: number): Promise<number | null> {
  const attendance = await prisma.attendance.findUnique({
    where: { id: attendanceId },
    select: { scheduledSchoolId: true, course: { select: { schoolId: true } } },
  });
  return attendance?.scheduledSchoolId ?? attendance?.course.schoolId ?? null;
}

// 判斷課堂是否已結束（台灣時間）：日期已過，或同日且結束時間已過（無法解析時間則以日期為準）
export function lessonEnded(date: Date, timeText: string | null | undefined): boolean {
  const nowTW = new Date(Date.now() + 8 * 3600 * 1000);
  const todayISO = nowTW.toISOString().slice(0, 10);
  const dateISO = date.toISOString().slice(0, 10);
  if (dateISO < todayISO) return true;
  if (dateISO > todayISO) return false;
  const match = String(timeText ?? "").replace(/[：]/g, ":").match(/(\d{1,2}):(\d{2})\s*$/);
  if (!match) return false;
  const endMinutes = Number(match[1]) * 60 + Number(match[2]);
  const nowMinutes = nowTW.getUTCHours() * 60 + nowTW.getUTCMinutes();
  return nowMinutes >= endMinutes;
}

// 自動開放評分：課已結束＋老師已回報（成果或出勤人數）＋未取消 → 補建 open 評分任務
// attendanceId UNIQUE 保證不重複建立
export async function openEligibleRatings(records: Array<{
  id: number;
  date: Date;
  cancelled: boolean;
  reportContent: string;
  studentCount: number | null;
  studentCountA?: number | null;
  studentCountB?: number | null;
  scheduledTime?: string | null;
  courseTime?: string;
}>): Promise<void> {
  await ensureCourseRatingTables();
  const eligible = records.filter((r) =>
    !r.cancelled
    && (r.reportContent.trim() !== "" || r.studentCount != null || r.studentCountA != null || r.studentCountB != null)
    && lessonEnded(r.date, r.scheduledTime?.trim() || r.courseTime),
  );
  if (!eligible.length) return;
  const ids = eligible.map((r) => r.id);
  const existing = await prisma.$queryRawUnsafe<Array<{ attendanceId: number }>>(
    `SELECT attendanceId FROM CourseRating WHERE attendanceId IN (${ids.map(() => "?").join(",")})`,
    ...ids,
  );
  const existingSet = new Set(existing.map((row) => Number(row.attendanceId)));
  for (const record of eligible) {
    if (existingSet.has(record.id)) continue;
    const token = crypto.randomBytes(24).toString("base64url");
    await prisma.$executeRawUnsafe(
      "INSERT OR IGNORE INTO CourseRating (attendanceId, token) VALUES (?, ?)",
      record.id, token,
    );
  }
}

export function validScore(value: unknown): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : null;
}
