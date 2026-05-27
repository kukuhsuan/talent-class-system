import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { courseLabel } from "@/lib/courseMeta";
import { ensureLessonTemplateTable, listLessonTemplates } from "@/lib/lessonTemplates";

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function cleanSkills(value: unknown) {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean).join("、");
  return cleanText(value);
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const rows = await listLessonTemplates(prisma, searchParams.get("courseType") ?? "");
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  await ensureLessonTemplateTable(prisma);
  const data = await req.json();
  const courseType = courseLabel(cleanText(data.courseType));
  const lesson = Number(data.lesson);
  const title = cleanText(data.title);
  if (!courseType || !lesson || !title) {
    return NextResponse.json({ error: "請填寫課程、堂數與課程名稱" }, { status: 400 });
  }

  await prisma.$executeRawUnsafe(
    `INSERT INTO LessonTemplate (courseType, lesson, title, focus, skills, activityDirection, aiStyle, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(courseType, lesson) DO UPDATE SET
       title = excluded.title,
       focus = excluded.focus,
       skills = excluded.skills,
       activityDirection = excluded.activityDirection,
       aiStyle = excluded.aiStyle,
       updatedAt = CURRENT_TIMESTAMP`,
    courseType,
    lesson,
    title,
    cleanText(data.focus),
    cleanSkills(data.skills),
    cleanText(data.activityDirection),
    cleanText(data.aiStyle),
  );
  await prisma.courseProgress.upsert({
    where: { courseType_lesson: { courseType, lesson } },
    update: { title },
    create: { courseType, lesson, title },
  });

  const rows = await prisma.$queryRawUnsafe<Array<{ id: number }>>(
    "SELECT id FROM LessonTemplate WHERE courseType = ? AND lesson = ? LIMIT 1",
    courseType,
    lesson,
  );
  return NextResponse.json({ ok: true, id: rows[0]?.id }, { status: 201 });
}
