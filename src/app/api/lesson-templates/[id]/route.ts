import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { courseLabel } from "@/lib/courseMeta";
import { ensureLessonTemplateTable } from "@/lib/lessonTemplates";

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function cleanSkills(value: unknown) {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean).join("、");
  return cleanText(value);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await ensureLessonTemplateTable(prisma);
  const { id } = await params;
  const data = await req.json();
  const courseType = courseLabel(cleanText(data.courseType));
  const lesson = Number(data.lesson);
  const title = cleanText(data.title);
  if (!courseType || !lesson || !title) {
    return NextResponse.json({ error: "請填寫課程、堂數與課程名稱" }, { status: 400 });
  }

  await prisma.$executeRawUnsafe(
    `UPDATE LessonTemplate
     SET courseType = ?, lesson = ?, title = ?, focus = ?, skills = ?, activityDirection = ?, aiStyle = ?, updatedAt = CURRENT_TIMESTAMP
     WHERE id = ?`,
    courseType,
    lesson,
    title,
    cleanText(data.focus),
    cleanSkills(data.skills),
    cleanText(data.activityDirection),
    cleanText(data.aiStyle),
    Number(id),
  );
  await prisma.courseProgress.upsert({
    where: { courseType_lesson: { courseType, lesson } },
    update: { title },
    create: { courseType, lesson, title },
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await ensureLessonTemplateTable(prisma);
  const { id } = await params;
  await prisma.$executeRawUnsafe("DELETE FROM LessonTemplate WHERE id = ?", Number(id));
  return NextResponse.json({ ok: true });
}
