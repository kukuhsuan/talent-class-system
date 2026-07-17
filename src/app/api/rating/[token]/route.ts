import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  CONTINUE_WISH_OPTIONS,
  getRatingByToken,
  raiseLowScoreAlert,
  ratingLessonInfo,
  validScore,
} from "@/lib/courseRating";

// 公開端點：安親班透過專屬連結讀取課堂資訊（免登入）
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const rating = await getRatingByToken(token);
  if (!rating) return NextResponse.json({ error: "找不到這個評分連結" }, { status: 404 });
  const lesson = await ratingLessonInfo(rating.attendanceId);
  if (!lesson) return NextResponse.json({ error: "找不到這堂課的資料" }, { status: 404 });
  return NextResponse.json({ status: rating.status, lesson });
}

// 公開端點：提交評分（一堂課僅能提交一次）
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
  return NextResponse.json({ ok: true });
}
