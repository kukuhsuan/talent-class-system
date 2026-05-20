import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateGrowthComment, growthTitle, parseScores } from "@/lib/kindergartenAssessment";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const rows = await prisma.$queryRawUnsafe<Array<{
      id: number;
      attendanceId: number;
      childName: string;
      semester: string;
      courseName: string;
      scores: string;
      comment: string;
      title: string;
      certificatePayload: string;
      createdAt: string;
      date: string;
      school: string;
      department: string;
      teacherName: string;
    }>>(
      `SELECT ka.id, ka.attendanceId, ka.childName, ka.semester, ka.courseName, ka.scores, ka.comment, ka.title, ka.certificatePayload, ka.createdAt,
        a.date, c.school, c.department, t.name as teacherName
       FROM KindergartenAssessment ka
       JOIN Attendance a ON a.id = ka.attendanceId
       JOIN Course c ON c.id = a.courseId
       JOIN Teacher t ON t.id = a.actualTeacherId
       WHERE ka.id = ?`,
      Number(id),
    );
    if (!rows[0]) return NextResponse.json({ error: "找不到評量紀錄" }, { status: 404 });
    return NextResponse.json(rows[0]);
  } catch (e) {
    console.error("assessment detail failed", e);
    return NextResponse.json({ error: `讀取評量紀錄失敗：${(e as Error).message}` }, { status: 500 });
  }
}

export async function PUT(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const rows = await prisma.$queryRawUnsafe<Array<{
      id: number;
      childName: string;
      courseName: string;
      scores: string;
    }>>("SELECT id, childName, courseName, scores FROM KindergartenAssessment WHERE id = ?", Number(id));
    const row = rows[0];
    if (!row) return NextResponse.json({ error: "找不到評量紀錄" }, { status: 404 });
    const scores = parseScores(row.scores);
    const comment = generateGrowthComment(row.childName, row.courseName, scores);
    const title = growthTitle(scores);
    await prisma.$executeRawUnsafe(
      "UPDATE KindergartenAssessment SET comment = ?, title = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?",
      comment,
      title,
      Number(id),
    );
    return NextResponse.json({ ok: true, comment, title });
  } catch (e) {
    console.error("assessment regenerate failed", e);
    return NextResponse.json({ error: `重新產生評語失敗：${(e as Error).message}` }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await prisma.$executeRawUnsafe("DELETE FROM KindergartenAssessment WHERE id = ?", Number(id));
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("assessment delete failed", e);
    return NextResponse.json({ error: `刪除評量紀錄失敗：${(e as Error).message}` }, { status: 500 });
  }
}
