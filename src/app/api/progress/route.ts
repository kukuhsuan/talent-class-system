import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { departmentQueryValues } from "@/lib/courseMeta";

// 解析 reportPhotos（JSON 陣列；相容舊資料單一字串），private 路徑轉成回報頁的照片端點
function reportPhotoUrls(value: string | null | undefined, attendanceId: number): string[] {
  const raw = String(value ?? "").trim();
  if (!raw) return [];
  let stored: string[] = [raw];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) stored = parsed.map((item) => String(item).trim()).filter(Boolean);
  } catch { /* 舊資料為單一網址字串 */ }
  return stored.map((item) => item.startsWith("private:")
    ? `/api/report/${attendanceId}/photo?path=${encodeURIComponent(item.slice("private:".length))}`
    : item);
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const year = searchParams.get("year");
  const month = searchParams.get("month");
  const dept = searchParams.get("dept") ?? "";
  const school = searchParams.get("school") ?? "";
  const teacherId = searchParams.get("teacherId") ?? "";
  const page = Math.max(1, Number(searchParams.get("page") ?? "0") || 0);
  const pageSizeRaw = Number(searchParams.get("pageSize") ?? "0") || 0;
  const pageSize = pageSizeRaw ? Math.min(50, Math.max(20, pageSizeRaw)) : 0;

  const where: Record<string, unknown> = { reportContent: { not: "" } };

  if (year && month) {
    const start = new Date(Number(year), Number(month) - 1, 1);
    const end = new Date(Number(year), Number(month), 1);
    where.date = { gte: start, lt: end };
  }

  const courseFilter: Record<string, unknown> = {};
  if (dept) courseFilter.department = { in: departmentQueryValues(dept) };
  if (school) courseFilter.school = school;
  if (Object.keys(courseFilter).length) where.course = courseFilter;

  if (teacherId) where.actualTeacherId = Number(teacherId);

  const query = {
    where,
    include: { course: true, actualTeacher: true },
    orderBy: [{ date: "desc" as const }],
  };

  const [records, total] = await Promise.all([
    prisma.attendance.findMany({ ...query, ...(pageSize ? { skip: (page - 1) * pageSize, take: pageSize } : {}) }),
    pageSize ? prisma.attendance.count({ where }) : Promise.resolve(0),
  ]);

  const items = records.map((record) => ({
    ...record,
    photoUrls: reportPhotoUrls((record as { reportPhotos?: string }).reportPhotos, record.id),
  }));
  if (pageSize) return NextResponse.json({ items, total, page, pageSize });
  return NextResponse.json(items);
}
