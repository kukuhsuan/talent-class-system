import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { courseLabel } from "@/lib/courseMeta";
import { listLessonTemplates } from "@/lib/lessonTemplates";

export const dynamic = "force-dynamic";

// 老師端教學課表：唯讀公開，只回傳呈現課表所需欄位（不含 aiStyle 等內部設定）
export async function GET(_req: Request, { params }: { params: Promise<{ courseType: string }> }) {
  const { courseType } = await params;
  const course = courseLabel(decodeURIComponent(courseType ?? ""));
  if (!course) return NextResponse.json({ courseName: "", items: [] });
  const rows = await listLessonTemplates(prisma, course);
  return NextResponse.json({
    courseName: course,
    items: rows.map((row) => ({
      lesson: Number(row.lesson),
      title: row.title,
      focus: row.focus,
      skills: row.skills,
      activityDirection: row.activityDirection,
    })),
  });
}
