import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  CONTINUE_WISH_OPTIONS,
  getRatingByToken,
  notifyOperationsOfAfterSchoolRating,
  raiseLowScoreAlert,
  ratingLessonInfo,
  ratingSchoolId,
  validScore,
} from "@/lib/courseRating";

export const dynamic = "force-dynamic";

// 同園所的下一堂待評分課程（完成一堂後自動接續）
async function nextOpenRating(schoolId: number, excludeAttendanceId: number) {
  const rows = await prisma.$queryRawUnsafe<Array<{ token: string; attendanceId: number }>>(
    `SELECT cr.token, cr.attendanceId FROM CourseRating cr
     JOIN Attendance a ON a.id = cr.attendanceId
     JOIN Course c ON c.id = a.courseId
     WHERE cr.status = 'open' AND cr.attendanceId != ?
       AND (a.scheduledSchoolId = ? OR (a.scheduledSchoolId IS NULL AND c.schoolId = ?))
     ORDER BY a.date ASC LIMIT 1`,
    excludeAttendanceId, schoolId, schoolId,
  );
  if (!rows.length) return null;
  const lesson = await ratingLessonInfo(Number(rows[0].attendanceId));
  if (!lesson) return null;
  return { url: `/rating/${encodeURIComponent(rows[0].token)}`, date: lesson.date, courseName: lesson.courseName, teacherName: lesson.teacherName };
}

// 園所透過專屬評分連結直接讀取課堂資訊
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const rating = await getRatingByToken(token);
  if (!rating) return NextResponse.json({ error: "找不到這個評分連結" }, { status: 404 });
  const lesson = await ratingLessonInfo(rating.attendanceId);
  if (!lesson) return NextResponse.json({ error: "找不到這堂課的資料" }, { status: 404 });
  return NextResponse.json({ status: rating.status, lesson }, {
    headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" },
  });
}

// 提交評分：專屬隨機 token 即為存取憑證，一堂課僅能提交一次
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const rating = await getRatingByToken(token);
  if (!rating) return NextResponse.json({ error: "找不到這個評分連結" }, { status: 404 });
  if (rating.status === "submitted") {
    return NextResponse.json({ error: "這堂課已完成評分，若需修改請聯繫我們重新開放" }, { status: 409 });
  }
  if (rating.status === "closed") {
    return NextResponse.json({ error: "這個評分連結已關閉" }, { status: 409 });
  }
  const lesson = await ratingLessonInfo(rating.attendanceId);
  if (!lesson) return NextResponse.json({ error: "找不到這堂課的資料" }, { status: 404 });

  const schoolId = await ratingSchoolId(rating.attendanceId);

  const data = await req.json().catch(() => ({}));
  const scores = {
    scorePunctuality: validScore(data.scorePunctuality),
    scoreTeaching: validScore(data.scoreTeaching),
    scoreOrder: validScore(data.scoreOrder),
    scoreInteraction: validScore(data.scoreInteraction),
    scoreOverall: validScore(data.scoreOverall),
  };
  if (Object.values(scores).some((v) => v === null)) {
    return NextResponse.json({ error: "每個評分項目都需要選擇 1–5 分" }, { status: 400 });
  }
  const continueWish = String(data.continueWish ?? "").trim();
  if (!(CONTINUE_WISH_OPTIONS as readonly string[]).includes(continueWish)) {
    return NextResponse.json({ error: "請選擇是否願意繼續安排此老師" }, { status: 400 });
  }
  const feedback = String(data.feedback ?? "").trim().slice(0, 2000);

  // 以 status='open' 作為條件避免同時提交造成重複寫入
  const updated = await prisma.$executeRawUnsafe(
    `UPDATE CourseRating SET
       scorePunctuality = ?, scoreTeaching = ?, scoreOrder = ?, scoreInteraction = ?, scoreOverall = ?,
       feedback = ?, continueWish = ?, status = 'submitted', submittedAt = CURRENT_TIMESTAMP
     WHERE token = ? AND status = 'open'`,
    scores.scorePunctuality, scores.scoreTeaching, scores.scoreOrder, scores.scoreInteraction, scores.scoreOverall,
    feedback, continueWish, token,
  );
  if (!Number(updated)) {
    return NextResponse.json({ error: "這堂課已完成評分，若需修改請聯繫我們重新開放" }, { status: 409 });
  }

  // 整體滿意度低於 3 分 → 進待處理中心
  if ((scores.scoreOverall ?? 5) < 3) {
    await raiseLowScoreAlert(rating.attendanceId, scores.scoreOverall ?? 0, lesson);
  }
  await notifyOperationsOfAfterSchoolRating({
    lesson,
    scorePunctuality: scores.scorePunctuality ?? 0,
    scoreTeaching: scores.scoreTeaching ?? 0,
    scoreOrder: scores.scoreOrder ?? 0,
    scoreInteraction: scores.scoreInteraction ?? 0,
    scoreOverall: scores.scoreOverall ?? 0,
    continueWish,
    feedback,
  }).catch((error) => console.error("notifyOperationsOfAfterSchoolRating failed:", error));
  const next = schoolId
    ? await nextOpenRating(schoolId, rating.attendanceId).catch(() => null)
    : null;
  return NextResponse.json({ ok: true, next });
}
