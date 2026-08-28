import { prisma } from "@/lib/prisma";
import { courseLabel } from "@/lib/courseMeta";
import { readLessonTemplatesBulk } from "@/lib/lessonTemplates";

// 課程提醒要帶的「這堂是第幾堂、上什麼」
export type UpcomingLesson = { lesson: number; title: string; focus: string; total: number };

// 老師回報的進度字串長這樣：「第11堂 煞車高手」
const LESSON_IN_REPORT = /第\s*(\d+)\s*堂/;

/**
 * 推算每門課在 targetIso 當天是第幾堂。
 *
 * 以老師最近一次回報的堂數為準，再加上那次之後又上過的堂數；
 * 完全沒有人回報過進度時，退回用已排課且未停課的堂數推算。
 * 超出課綱堂數就不回傳，免得提醒卡片出現「第 25 堂」這種數字。
 */
export async function upcomingLessonMap(
  courses: Array<{ id: number; courseType: string }>,
  targetIso: string,
) {
  const map = new Map<number, UpcomingLesson>();
  const ids = [...new Set(courses.map((c) => c.id).filter((id) => Number.isFinite(id) && id > 0))];
  if (ids.length === 0) return map;

  const rows = await prisma.attendance.findMany({
    where: {
      courseId: { in: ids },
      cancelled: false,
      date: { lt: new Date(`${targetIso}T00:00:00.000Z`) },
    },
    orderBy: [{ courseId: "asc" }, { date: "desc" }],
    select: { courseId: true, reportContent: true },
  });

  type Tally = { reported?: number; sinceReported: number; total: number };
  const tally = new Map<number, Tally>();
  for (const row of rows) {
    const state = tally.get(row.courseId) ?? { sinceReported: 0, total: 0 };
    state.total += 1;
    if (state.reported == null) {
      const matched = LESSON_IN_REPORT.exec(row.reportContent ?? "");
      if (matched) state.reported = Number(matched[1]);
      else state.sinceReported += 1;
    }
    tally.set(row.courseId, state);
  }

  const templates = await readLessonTemplatesBulk(prisma, courses.map((c) => c.courseType));
  for (const course of courses) {
    const state = tally.get(course.id);
    const done = state ? (state.reported != null ? state.reported + state.sinceReported : state.total) : 0;
    const lesson = done + 1;
    const lessons = templates.get(courseLabel(course.courseType)) ?? [];
    const matched = lessons.find((row) => row.lesson === lesson);
    if (!matched?.title.trim()) continue;
    map.set(course.id, {
      lesson,
      title: matched.title.trim(),
      focus: matched.focus.trim(),
      total: lessons.length,
    });
  }
  return map;
}
