import crypto from "crypto";
import { prisma } from "@/lib/prisma";
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
};

export async function ratingLessonInfo(attendanceId: number): Promise<RatingLessonInfo | null> {
  const attendance = await prisma.attendance.findUnique({
    where: { id: attendanceId },
    include: { course: true, actualTeacher: true },
  });
  if (!attendance || !isAfterSchool(attendance.course.department)) return null;
  return {
    attendanceId: attendance.id,
    school: attendance.course.school,
    courseName: attendance.course.courseType,
    courseCode: attendance.course.code,
    date: attendance.date.toISOString().slice(0, 10),
    teacherName: attendance.actualTeacher?.name ?? "",
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

export function validScore(value: unknown): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : null;
}
