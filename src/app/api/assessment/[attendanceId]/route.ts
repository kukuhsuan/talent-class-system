import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { courseLabel } from "@/lib/courseMeta";
import { assessmentSemester, generateGrowthComment, growthTitle, normalizeScores, parseScores, scoreAverage } from "@/lib/kindergartenAssessment";
import { verifyPublicAccessToken } from "@/lib/publicAccessToken";

type Payload = {
  childName?: string;
  scores?: Record<string, number>;
};

function isKindergarten(department: string | null | undefined) {
  return (department ?? "").includes("幼兒園");
}

async function ensureAssessmentTable() {
  await prisma.$executeRawUnsafe(
    'CREATE TABLE IF NOT EXISTS KindergartenAssessment (id INTEGER PRIMARY KEY AUTOINCREMENT, attendanceId INTEGER NOT NULL, childName TEXT NOT NULL, semester TEXT NOT NULL DEFAULT "", courseName TEXT NOT NULL DEFAULT "", scores TEXT NOT NULL DEFAULT "", comment TEXT NOT NULL DEFAULT "", title TEXT NOT NULL DEFAULT "", certificatePayload TEXT NOT NULL DEFAULT "", createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)',
  );
  await prisma.$executeRawUnsafe("CREATE INDEX IF NOT EXISTS KindergartenAssessment_attendanceId_idx ON KindergartenAssessment(attendanceId)");
}

async function isFinalAttendance(attendance: { id: number; date: Date; courseId: number; course: { department: string } }) {
  if (!isKindergarten(attendance.course.department)) return false;
  const latest = await prisma.attendance.findFirst({
    where: { courseId: attendance.courseId },
    orderBy: { date: "desc" },
    select: { id: true, date: true },
  });
  return Boolean(latest && (latest.id === attendance.id || latest.date <= attendance.date));
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ attendanceId: string }> }) {
  try {
    await ensureAssessmentTable();
    const { attendanceId } = await params;
    const verified = verifyPublicAccessToken(decodeURIComponent(attendanceId), "assessment");
    const attendance = await prisma.attendance.findUnique({
      where: { id: verified.attendanceId },
      include: { course: true, actualTeacher: true },
    });
    if (!attendance) return NextResponse.json({ error: "找不到評量課程" }, { status: 404 });
    if (!isKindergarten(attendance.course.department)) return NextResponse.json({ error: "此功能只開放幼兒園課程使用" }, { status: 400 });

    const rows = await prisma.$queryRawUnsafe<Array<{
      id: number;
      childName: string;
      scores: string;
      title: string;
      comment: string;
    }>>(
      "SELECT id, childName, scores, title, comment FROM KindergartenAssessment WHERE attendanceId = ? ORDER BY id DESC",
      attendance.id,
    );

    return NextResponse.json({
      attendanceId: attendance.id,
      date: attendance.date.toISOString().slice(0, 10),
      school: attendance.course.school,
      department: attendance.course.department,
      courseName: courseLabel(attendance.course.courseType),
      teacherName: attendance.actualTeacher.name,
      isFinalCourse: await isFinalAttendance(attendance),
      assessmentCount: rows.length,
      assessments: rows.map((row) => ({
        ...row,
        average: Number(scoreAverage(parseScores(row.scores)).toFixed(1)),
      })),
    });
  } catch (e) {
    if ((e as Error).message.includes("token") || (e as Error).message.includes("Expired")) {
      return NextResponse.json({ error: "評量連結無效或已過期" }, { status: 401 });
    }
    console.error("assessment load failed", e);
    return NextResponse.json({ error: `讀取評量資料失敗：${(e as Error).message}` }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ attendanceId: string }> }) {
  try {
    await ensureAssessmentTable();
    const { attendanceId } = await params;
    const verified = verifyPublicAccessToken(decodeURIComponent(attendanceId), "assessment");
    const attendance = await prisma.attendance.findUnique({
      where: { id: verified.attendanceId },
      include: { course: true },
    });
    if (!attendance) return NextResponse.json({ error: "找不到評量課程" }, { status: 404 });
    if (!isKindergarten(attendance.course.department)) return NextResponse.json({ error: "此功能只開放幼兒園課程使用" }, { status: 400 });
    if (!(await isFinalAttendance(attendance))) return NextResponse.json({ error: "目前不是此課程最後一堂，暫不需要學期評量" }, { status: 400 });

    const data = (await req.json()) as Payload;
    const childName = String(data.childName ?? "").trim();
    if (!childName) return NextResponse.json({ error: "請填寫孩子姓名" }, { status: 400 });
    const scores = normalizeScores(data.scores ?? {});
    const courseName = courseLabel(attendance.course.courseType);
    const semester = assessmentSemester(attendance.date);
    const comment = generateGrowthComment(childName, courseName, scores);
    const title = growthTitle(scores);
    const certificatePayload = JSON.stringify({
      childName,
      courseName,
      semester,
      scores,
      comment,
      title,
      date: new Date().toISOString().slice(0, 10),
    });

    await prisma.$executeRawUnsafe(
      "INSERT INTO KindergartenAssessment (attendanceId, childName, semester, courseName, scores, comment, title, certificatePayload, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
      attendance.id,
      childName,
      semester,
      courseName,
      JSON.stringify(scores),
      comment,
      title,
      certificatePayload,
    );
    const rows = await prisma.$queryRawUnsafe<{ id: number }[]>("SELECT id FROM KindergartenAssessment ORDER BY id DESC LIMIT 1");
    return NextResponse.json({ ok: true, id: Number(rows[0]?.id), comment, title });
  } catch (e) {
    if ((e as Error).message.includes("token") || (e as Error).message.includes("Expired")) {
      return NextResponse.json({ error: "評量連結無效或已過期" }, { status: 401 });
    }
    console.error("assessment save failed", e);
    return NextResponse.json({ error: `儲存評量失敗：${(e as Error).message}` }, { status: 500 });
  }
}
