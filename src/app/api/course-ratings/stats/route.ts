import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { BACKOFFICE_ROLES, requireRole } from "@/lib/permissions";
import { CourseRatingRow, ensureCourseRatingTables, normalizeRatingRow } from "@/lib/courseRating";

// 後台：各老師評分統計（平均、次數、各項平均、最近意見）
export async function GET() {
  const auth = await requireRole(BACKOFFICE_ROLES);
  if (auth.response) return auth.response;
  await ensureCourseRatingTables();

  const rows = await prisma.$queryRawUnsafe<CourseRatingRow[]>(
    "SELECT * FROM CourseRating WHERE status = 'submitted' ORDER BY id DESC",
  );
  const ratings = rows.map(normalizeRatingRow);
  if (!ratings.length) return NextResponse.json([]);

  const attendances = await prisma.attendance.findMany({
    where: { id: { in: ratings.map((r) => r.attendanceId) } },
    select: {
      id: true,
      date: true,
      actualTeacherId: true,
      course: { select: { school: true } },
    },
  });
  const byId = new Map(attendances.map((a) => [a.id, a]));

  type Stat = {
    teacherId: number;
    count: number;
    sumPunctuality: number; sumTeaching: number; sumOrder: number; sumInteraction: number; sumOverall: number;
    recentFeedback: { date: string; school: string; feedback: string; continueWish: string }[];
  };
  const stats = new Map<number, Stat>();
  for (const rating of ratings) {
    const attendance = byId.get(rating.attendanceId);
    if (!attendance) continue;
    const teacherId = attendance.actualTeacherId;
    const stat = stats.get(teacherId) ?? {
      teacherId, count: 0,
      sumPunctuality: 0, sumTeaching: 0, sumOrder: 0, sumInteraction: 0, sumOverall: 0,
      recentFeedback: [],
    };
    stat.count += 1;
    stat.sumPunctuality += rating.scorePunctuality;
    stat.sumTeaching += rating.scoreTeaching;
    stat.sumOrder += rating.scoreOrder;
    stat.sumInteraction += rating.scoreInteraction;
    stat.sumOverall += rating.scoreOverall;
    if (stat.recentFeedback.length < 3 && (rating.feedback || rating.continueWish)) {
      stat.recentFeedback.push({
        date: attendance.date.toISOString().slice(0, 10),
        school: attendance.course.school,
        feedback: rating.feedback,
        continueWish: rating.continueWish,
      });
    }
    stats.set(teacherId, stat);
  }

  const avg = (sum: number, count: number) => Math.round((sum / count) * 10) / 10;
  const result = [...stats.values()].map((s) => ({
    teacherId: s.teacherId,
    count: s.count,
    avgPunctuality: avg(s.sumPunctuality, s.count),
    avgTeaching: avg(s.sumTeaching, s.count),
    avgOrder: avg(s.sumOrder, s.count),
    avgInteraction: avg(s.sumInteraction, s.count),
    avgOverall: avg(s.sumOverall, s.count),
    recentFeedback: s.recentFeedback,
  }));
  return NextResponse.json(result);
}
