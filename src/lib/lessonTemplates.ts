import type { PrismaClient } from "@prisma/client";
import { courseLabel } from "@/lib/courseMeta";
import { COURSE_CURRICULUM } from "@/lib/line";
import { parseLessonNumber } from "@/lib/lessonContent";

export type LessonTemplateForReport = {
  courseType: string;
  lesson: number;
  title: string;
  focus: string;
  skills: string[];
  activityDirection: string;
  aiStyle: string;
};

type LessonTemplateRow = {
  id?: number;
  courseType: string;
  lesson: number;
  title: string;
  focus: string;
  skills: string;
  activityDirection: string;
  aiStyle: string;
};

function cleanProgressTitle(progress: string) {
  return progress
    .replace(/^第\s*\d+\s*堂\s*/u, "")
    .replace(/^[:：｜|\-\s]+/u, "")
    .trim();
}

function uniqueItems(items: string[]) {
  return [...new Set(items.map((item) => item.trim()).filter(Boolean))];
}

function emptyTemplateFromProgress(courseType: string, lesson: number, title: string): LessonTemplateForReport {
  const course = courseLabel(courseType);

  return {
    courseType: course,
    lesson,
    title,
    focus: "",
    skills: [],
    activityDirection: "",
    aiStyle: "",
  };
}

function rowToTemplate(row: LessonTemplateRow): LessonTemplateForReport {
  return {
    courseType: row.courseType,
    lesson: Number(row.lesson),
    title: row.title,
    focus: row.focus,
    skills: uniqueItems(row.skills.split(/[、,，\n]/u)),
    activityDirection: row.activityDirection,
    aiStyle: row.aiStyle,
  };
}

export async function ensureLessonTemplateTable(prisma: PrismaClient) {
  await prisma.$executeRawUnsafe(
    'CREATE TABLE IF NOT EXISTS LessonTemplate (id INTEGER PRIMARY KEY AUTOINCREMENT, courseType TEXT NOT NULL, lesson INTEGER NOT NULL, title TEXT NOT NULL, focus TEXT NOT NULL DEFAULT "", skills TEXT NOT NULL DEFAULT "", activityDirection TEXT NOT NULL DEFAULT "", aiStyle TEXT NOT NULL DEFAULT "", createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)',
  );
  await prisma.$executeRawUnsafe(
    "CREATE UNIQUE INDEX IF NOT EXISTS LessonTemplate_courseType_lesson_key ON LessonTemplate(courseType, lesson)",
  );
}

async function syncLessonTemplatesFromProgress(prisma: PrismaClient, courseType: string) {
  const course = courseLabel(courseType);
  const progressRows = await prisma.$queryRawUnsafe<Array<{ lesson: number; title: string }>>(
    "SELECT lesson, title FROM CourseProgress WHERE courseType = ? ORDER BY lesson ASC",
    course,
  );
  const fallbackRows = COURSE_CURRICULUM[course]?.map((item) => ({ lesson: item.lesson, title: item.title })) ?? [];
  const rows = progressRows.length ? progressRows : fallbackRows;
  for (const row of rows) {
    await prisma.$executeRawUnsafe(
      "INSERT OR IGNORE INTO LessonTemplate (courseType, lesson, title, focus, skills, activityDirection, aiStyle, updatedAt) VALUES (?, ?, ?, '', '', '', '', CURRENT_TIMESTAMP)",
      course,
      Number(row.lesson),
      row.title,
    );
  }
}

export async function getLessonTemplateForReport(
  prisma: PrismaClient,
  courseType: string,
  progress: string,
): Promise<LessonTemplateForReport | null> {
  const course = courseLabel(courseType);
  const lesson = parseLessonNumber(progress);
  if (!lesson) return null;

  await ensureLessonTemplateTable(prisma);
  const existing = await prisma.$queryRawUnsafe<LessonTemplateRow[]>(
    "SELECT courseType, lesson, title, focus, skills, activityDirection, aiStyle FROM LessonTemplate WHERE courseType = ? AND lesson = ? LIMIT 1",
    course,
    lesson,
  );
  if (existing[0]) return rowToTemplate(existing[0]);

  const titleFromProgress = cleanProgressTitle(progress);
  const titleFromCurriculum = COURSE_CURRICULUM[course]?.find((item) => item.lesson === lesson)?.title;
  const progressRow = await prisma.$queryRawUnsafe<Array<{ title: string }>>(
    "SELECT title FROM CourseProgress WHERE courseType = ? AND lesson = ? LIMIT 1",
    course,
    lesson,
  );
  const title = titleFromProgress || progressRow[0]?.title || titleFromCurriculum || `${course}第${lesson}堂`;
  const template = emptyTemplateFromProgress(course, lesson, title);

  await prisma.$executeRawUnsafe(
    "INSERT OR IGNORE INTO LessonTemplate (courseType, lesson, title, focus, skills, activityDirection, aiStyle, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)",
    template.courseType,
    template.lesson,
    template.title,
    template.focus,
    template.skills.join("、"),
    template.activityDirection,
    template.aiStyle,
  );

  return template;
}

export async function listLessonTemplates(prisma: PrismaClient, courseType = "") {
  await ensureLessonTemplateTable(prisma);
  const course = courseType ? courseLabel(courseType) : "";
  if (course) await syncLessonTemplatesFromProgress(prisma, course);
  const sql = course
    ? "SELECT id, courseType, lesson, title, focus, skills, activityDirection, aiStyle FROM LessonTemplate WHERE courseType = ? ORDER BY lesson ASC"
    : "SELECT id, courseType, lesson, title, focus, skills, activityDirection, aiStyle FROM LessonTemplate ORDER BY courseType ASC, lesson ASC";
  const rows = course
    ? await prisma.$queryRawUnsafe<Array<LessonTemplateRow & { id: number }>>(sql, course)
    : await prisma.$queryRawUnsafe<Array<LessonTemplateRow & { id: number }>>(sql);
  return rows.map((row) => ({ ...row, skills: uniqueItems(row.skills.split(/[、,，\n]/u)) }));
}
