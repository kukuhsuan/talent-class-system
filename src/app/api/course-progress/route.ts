import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { courseLabel } from "@/lib/courseMeta";
import { COURSE_CURRICULUM } from "@/lib/line";

async function ensureDefaultProgress() {
  const count = await prisma.courseProgress.count();
  if (count > 0) return;

  for (const [courseType, items] of Object.entries(COURSE_CURRICULUM)) {
    for (const item of items) {
      await prisma.courseProgress.upsert({
        where: { courseType_lesson: { courseType, lesson: item.lesson } },
        update: {},
        create: { courseType, lesson: item.lesson, title: item.title },
      });
    }
  }
}

export async function GET(req: NextRequest) {
  await ensureDefaultProgress();
  const { searchParams } = new URL(req.url);
  const raw = searchParams.get("courseType") ?? "";
  const courseType = raw ? courseLabel(raw) : "";
  const rows = await prisma.courseProgress.findMany({
    where: courseType ? { courseType } : {},
    orderBy: [{ courseType: "asc" }, { lesson: "asc" }],
  });
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const data = await req.json();
  const courseType = courseLabel(data.courseType);
  const lesson = Number(data.lesson);
  if (!courseType || !lesson || !data.title?.trim()) {
    return NextResponse.json({ error: "請填寫課程、堂數與內容" }, { status: 400 });
  }
  const row = await prisma.courseProgress.upsert({
    where: { courseType_lesson: { courseType, lesson } },
    update: { title: data.title.trim() },
    create: { courseType, lesson, title: data.title.trim() },
  });
  return NextResponse.json(row, { status: 201 });
}
