import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateGrowthComment, growthTitle, parseScores } from "@/lib/kindergartenAssessment";
import { writeAuditLog } from "@/lib/auditLog";

function safeJsonObject(raw: string) {
  try {
    const parsed = JSON.parse(raw || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

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

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const rows = await prisma.$queryRawUnsafe<Array<{
      id: number;
      childName: string;
      courseName: string;
      scores: string;
      comment: string;
      title: string;
      certificatePayload: string;
    }>>("SELECT id, childName, courseName, scores, comment, title, certificatePayload FROM KindergartenAssessment WHERE id = ?", Number(id));
    const row = rows[0];
    if (!row) return NextResponse.json({ error: "找不到評量紀錄" }, { status: 404 });
    const scores = parseScores(row.scores);
    const comment = generateGrowthComment(row.childName, row.courseName, scores);
    const title = growthTitle(scores);
    const certificatePayload = JSON.stringify({
      ...safeJsonObject(row.certificatePayload),
      childName: row.childName,
      courseName: row.courseName,
      scores,
      comment,
      title,
    });
    await prisma.$executeRawUnsafe(
      "UPDATE KindergartenAssessment SET comment = ?, title = ?, certificatePayload = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?",
      comment,
      title,
      certificatePayload,
      Number(id),
    );
    await writeAuditLog(req, {
      action: "update",
      targetType: "KindergartenAssessment",
      targetId: row.id,
      targetLabel: `${row.courseName} ${row.childName}`,
      beforeData: row,
      afterData: { ...row, comment, title, certificatePayload },
      diffSummary: `重新產生學期評量評語：${row.childName} ${row.courseName}`,
    });
    return NextResponse.json({ ok: true, comment, title });
  } catch (e) {
    console.error("assessment regenerate failed", e);
    return NextResponse.json({ error: `重新產生評語失敗：${(e as Error).message}` }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const rows = await prisma.$queryRawUnsafe<Array<{
      id: number;
      childName: string;
      courseName: string;
      scores: string;
      comment: string;
      title: string;
    }>>("SELECT id, childName, courseName, scores, comment, title FROM KindergartenAssessment WHERE id = ?", Number(id));
    const row = rows[0];
    await prisma.$executeRawUnsafe("DELETE FROM KindergartenAssessment WHERE id = ?", Number(id));
    await writeAuditLog(req, {
      action: "delete",
      targetType: "KindergartenAssessment",
      targetId: Number(id),
      targetLabel: row ? `${row.courseName} ${row.childName}` : String(id),
      beforeData: row,
      diffSummary: row ? `刪除學期評量：${row.childName} ${row.courseName}` : `刪除學期評量：${id}`,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("assessment delete failed", e);
    return NextResponse.json({ error: `刪除評量紀錄失敗：${(e as Error).message}` }, { status: 500 });
  }
}
