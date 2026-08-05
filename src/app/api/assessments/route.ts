import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export type AssessmentListRow = {
  id: number;
  attendanceId: number;
  childName: string;
  semester: string;
  courseName: string;
  scores: string;
  comment: string;
  title: string;
  createdAt: string;
  date: string;
  school: string;
  department: string;
  teacherName: string;
};

let assessmentTableReady = false;
async function ensureAssessmentTable() {
  if (assessmentTableReady) return;
  await prisma.$executeRawUnsafe(
    'CREATE TABLE IF NOT EXISTS KindergartenAssessment (id INTEGER PRIMARY KEY AUTOINCREMENT, attendanceId INTEGER NOT NULL, childName TEXT NOT NULL, semester TEXT NOT NULL DEFAULT "", courseName TEXT NOT NULL DEFAULT "", scores TEXT NOT NULL DEFAULT "", comment TEXT NOT NULL DEFAULT "", title TEXT NOT NULL DEFAULT "", certificatePayload TEXT NOT NULL DEFAULT "", createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)',
  );
  assessmentTableReady = true;
}

export async function GET(req: NextRequest) {
  try {
    await ensureAssessmentTable();
    const params = req.nextUrl.searchParams;
    const year = params.get("year") ?? "";
    const month = params.get("month") ?? "";
    const school = params.get("school") ?? "";
    const conditions = ["1=1"];
    const args: unknown[] = [];
    // a.date 是 Attendance.date，Prisma 在 SQLite 存成整數毫秒。
    // strftime 收到數值參數時會當成儒略日，1754352000000 遠超範圍 → 回傳 NULL，
    // 永遠不等於 "2026" 或 "08"，所以年份與月份篩選從來沒有篩到任何一筆
    //（不帶篩選時正常，這也是為什麼一直沒被發現）。
    // 先除以 1000 再用 'unixepoch' 轉成真正的日期。
    if (year) {
      conditions.push("strftime('%Y', a.date / 1000, 'unixepoch') = ?");
      args.push(year);
    }
    if (month) {
      conditions.push("strftime('%m', a.date / 1000, 'unixepoch') = ?");
      args.push(String(month).padStart(2, "0"));
    }
    if (school) {
      conditions.push("c.school = ?");
      args.push(school);
    }

    const rows = await prisma.$queryRawUnsafe<AssessmentListRow[]>(
      `SELECT ka.id, ka.attendanceId, ka.childName, ka.semester, ka.courseName, ka.scores, ka.comment, ka.title, ka.createdAt,
        a.date, COALESCE(NULLIF(a.scheduledSchoolName, ''), c.school) AS school, c.department, t.name as teacherName
       FROM KindergartenAssessment ka
       JOIN Attendance a ON a.id = ka.attendanceId
       JOIN Course c ON c.id = a.courseId
       JOIN Teacher t ON t.id = a.actualTeacherId
       WHERE ${conditions.join(" AND ")}
       ORDER BY a.date DESC, ka.id DESC
       LIMIT ?`,
      ...args,
      Math.min(500, Math.max(20, Number(params.get("limit")) || 200)),
    );
    return NextResponse.json(rows);
  } catch (e) {
    console.error("assessments list failed", e);
    return NextResponse.json({ error: `讀取學期評量失敗：${(e as Error).message}` }, { status: 500 });
  }
}
