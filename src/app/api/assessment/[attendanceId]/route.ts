import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { courseLabel } from "@/lib/courseMeta";
import { assessmentSemester, generateGrowthComment, growthTitle, normalizeScores } from "@/lib/kindergartenAssessment";

type Payload = {
  childName?: string;
  semester?: string;
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
    const attendance = await prisma.attendance.findUnique({
      where: { id: Number(attendanceId) },
      include: { course: true, actualTeacher: true },
    });
    if (!attendance) return NextResponse.json({ error: "找不到評量課程" }, { status: 404 });
    if (!isKindergarten(attendance.course.department)) return NextResponse.json({ error: "此功能只開放幼兒園課程使用" }, { status: 400 });

    const rows = await prisma.$queryRawUnsafe<{ count: number }[]>(
      "SELECT COUNT(*) as count FROM KindergartenAssessment WHERE attendanceId = ?",
      attendance.id,
    );

    return NextResponse.json({
      attendanceId: attendance.id,
      date: attendance.date.toISOString().slice(0, 10),
      school: attendance.course.school,
      department: attendance.course.department,
      courseName: courseLabel(attendance.course.courseType),
      teacherName: attendance.actualTeacher.name,
      semester: assessmentSemester(attendance.date),
      isFinalCourse: await isFinalAttendance(attendance),
      assessmentCount: Number(rows[0]?.count ?? 0),
    });
  } catch (e) {
    console.error("assessment load failed", e);
    return NextResponse.json({ error: `讀取評量資料失敗：${(e as Error).message}` }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ attendanceId: string }> }) {
  try {
    await ensureAssessmentTable();
    const { attendanceId } = await params;
    const attendance = await prisma.attendance.findUnique({
      where: { id: Number(attendanceId) },
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
    const semester = String(data.semester ?? assessmentSemester(attendance.date)).trim();
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
    console.error("assessment save failed", e);
    return NextResponse.json({ error: `儲存評量失敗：${(e as Error).message}` }, { status: 500 });
  }
}
