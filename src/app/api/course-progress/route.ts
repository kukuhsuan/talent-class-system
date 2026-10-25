import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { courseLabel } from "@/lib/courseMeta";
import { COURSE_CURRICULUM } from "@/lib/line";

async function ensureDefaultProgress() {
  // 每次補齊缺少的標準課綱，而不是只在整張表為空時初始化。
  // 這樣後續新增棒球等課程時，既有環境也能取得新課綱；update 留空，
  // 不會覆蓋行政已經自行調整過的進度名稱。
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
