import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * 請款漏帳掃描（唯讀 dry-run）
 *
 * 背景：請款單以 Course.schoolId 或 Course.school 名稱字串比對園所。
 * 若課程 schoolId 為 null 且名稱比對不到任何 School，該課程的出勤
 * 永遠不會出現在任何請款單上（靜默漏收）。此端點列出全部斷鏈課程。
 */
export async function GET() {
  try {
    const [courses, schools] = await Promise.all([
      prisma.course.findMany({
        where: { isActive: true },
        select: {
          id: true, code: true, school: true, schoolId: true,
          courseType: true, department: true,
          schoolRel: { select: { id: true, name: true } },
          _count: { select: { attendances: true } },
        },
        orderBy: [{ school: "asc" }, { code: "asc" }],
      }),
      prisma.school.findMany({ select: { id: true, name: true } }),
    ]);
    const schoolNames = new Map(schools.map((s) => [s.name.trim(), s.id]));

    const unlinked = []; // schoolId 為 null 且名稱比對不到 → 請款一定漏
    const nameMismatch = []; // schoolId 有值但名稱字串與 School.name 不一致 → 字串比對路徑會失效
    const linkableByName = []; // schoolId 為 null 但名稱可比對到 → 可自動補 schoolId

    for (const course of courses) {
      const item = {
        courseId: course.id,
        code: course.code,
        school: course.school,
        schoolId: course.schoolId,
        linkedSchoolName: course.schoolRel?.name ?? null,
        courseType: course.courseType,
        department: course.department,
        attendanceCount: course._count.attendances,
      };
      if (course.schoolId == null) {
        const matchedId = schoolNames.get(course.school.trim());
        if (matchedId) linkableByName.push({ ...item, suggestedSchoolId: matchedId });
        else unlinked.push(item);
      } else if (course.schoolRel && course.schoolRel.name.trim() !== course.school.trim()) {
        nameMismatch.push(item);
      }
    }

    return NextResponse.json({
      dryRun: true,
      note: "唯讀掃描，未修改任何資料。unlinked 內的課程目前不會出現在任何請款單上，請優先處理。",
      summary: {
        activeCourses: courses.length,
        unlinkedCount: unlinked.length,
        unlinkedAttendanceCount: unlinked.reduce((sum, c) => sum + c.attendanceCount, 0),
        linkableByNameCount: linkableByName.length,
        nameMismatchCount: nameMismatch.length,
      },
      unlinked,
      linkableByName,
      nameMismatch,
    });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
