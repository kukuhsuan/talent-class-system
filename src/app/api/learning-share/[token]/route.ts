import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { courseLabel } from "@/lib/courseMeta";
import { verifyParentShareToken } from "@/lib/publicAccessToken";

export const dynamic = "force-dynamic";

function parsePhotos(raw: string | null | undefined, token: string) {
  const value = String(raw ?? "").trim();
  if (!value) return [];
  let photos: string[] = [];
  try {
    const parsed = JSON.parse(value);
    photos = Array.isArray(parsed) ? parsed.map(String) : [value];
  } catch {
    photos = [value];
  }
  return photos.filter(Boolean).map((stored) => stored.startsWith("private:")
    ? `/api/report/${encodeURIComponent(token)}/photo?path=${encodeURIComponent(stored.slice("private:".length))}`
    : stored);
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const { attendanceId } = verifyParentShareToken(decodeURIComponent(token));
    const row = await prisma.attendance.findUnique({
      where: { id: attendanceId },
      select: {
        id: true, date: true, reportContent: true, skillFocus: true, classStatus: true,
        aiSummary: true, aiTeachingNote: true, reportPhotos: true,
        scheduledSchoolName: true,
        actualTeacher: { select: { name: true } },
        course: { select: { school: true, courseType: true } },
      },
    });
    if (!row || !(row.reportContent.trim() || row.aiSummary.trim() || row.aiTeachingNote.trim())) {
      return NextResponse.json({ error: "找不到這筆學習成果" }, { status: 404 });
    }
    return NextResponse.json({
      id: row.id,
      date: row.date.toISOString().slice(0, 10),
      school: row.scheduledSchoolName?.trim() || row.course.school,
      courseName: courseLabel(row.course.courseType),
      teacherName: row.actualTeacher.name,
      reportContent: row.reportContent,
      summary: row.aiTeachingNote.trim() || row.aiSummary.trim(),
      skillFocus: row.skillFocus,
      classStatus: row.classStatus,
      photoUrls: parsePhotos(row.reportPhotos, token),
    }, { headers: { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" } });
  } catch {
    return NextResponse.json({ error: "分享連結無效或已過期" }, { status: 401 });
  }
}
