import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { NOTIFY_ROLES, requireRole } from "@/lib/permissions";
import { maskLineId } from "@/lib/notifyBatch";

// 批次通知收件人清單：只回篩選必要欄位，不回銀行/電話/Email/完整 LINE ID
export async function GET(req: NextRequest) {
  const { response } = await requireRole(NOTIFY_ROLES);
  if (response) return response;
  const type = req.nextUrl.searchParams.get("type") === "school" ? "school" : "teacher";

  if (type === "teacher") {
    const teachers = await prisma.teacher.findMany({
      select: {
        id: true, name: true, lineUserId: true, lineRegion: true, isAssistant: true,
        courses: { where: { isActive: true }, select: { courseType: true, region: true } },
        assistantCourses: { where: { isActive: true }, select: { courseType: true, region: true } },
      },
      orderBy: { name: "asc" },
    });
    return NextResponse.json(teachers.map((t) => {
      const all = [...t.courses, ...t.assistantCourses];
      return {
        id: t.id,
        name: t.name,
        lineBound: Boolean(t.lineUserId),
        maskedLineId: maskLineId(t.lineUserId),
        lineRegion: t.lineRegion || "north",
        courseTypes: [...new Set(all.map((c) => c.courseType).filter(Boolean))],
        regions: [...new Set(all.map((c) => c.region).filter(Boolean))],
        activeCourseCount: all.length,
      };
    }));
  }

  const schools = await prisma.school.findMany({
    select: {
      id: true, name: true, region: true, lineUserId: true,
      courses: { where: { isActive: true }, select: { courseType: true, department: true } },
    },
    orderBy: { name: "asc" },
  });
  // School.lineRegion 為動態欄位，raw 查詢（失敗時預設 school）
  const regionMap = new Map<number, string>();
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{ id: number | bigint; lineRegion: string | null }>>(
      "SELECT id, lineRegion FROM School",
    );
    for (const row of rows) regionMap.set(Number(row.id), row.lineRegion === "school2" ? "school2" : "school");
  } catch { /* 欄位尚未建立 */ }

  return NextResponse.json(schools.map((s) => ({
    id: s.id,
    name: s.name,
    region: s.region || "",
    lineBound: Boolean(s.lineUserId),
    maskedLineId: maskLineId(s.lineUserId),
    lineRegion: regionMap.get(s.id) ?? "school",
    courseTypes: [...new Set(s.courses.map((c) => c.courseType).filter(Boolean))],
    isAfterSchool: s.courses.some((c) => (c.department ?? "").includes("安親")),
    activeCourseCount: s.courses.length,
  })));
}
