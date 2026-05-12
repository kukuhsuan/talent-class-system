import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLineConfig, pushMessage, buildScheduleMessage } from "@/lib/line";
import type { LineRegion } from "@/lib/line";

const DAY_ORDER = ["星期一", "星期二", "星期三", "星期四", "星期五", "星期六", "星期日"];

// POST /api/line/schedule
// body: { teacherId? } — omit to send to all bound teachers
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));

  // Compute next week's Mon–Sun range label
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0=Sun
  const daysUntilMon = dayOfWeek === 0 ? 1 : 8 - dayOfWeek;
  const nextMon = new Date(now);
  nextMon.setDate(now.getDate() + daysUntilMon);
  const nextSun = new Date(nextMon);
  nextSun.setDate(nextMon.getDate() + 6);
  const fmt = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`;
  const weekLabel = `${fmt(nextMon)} ~ ${fmt(nextSun)}`;

  const whereTeacher = body.teacherId ? { id: Number(body.teacherId) } : { lineUserId: { not: null } };

  const teachers = await prisma.teacher.findMany({
    where: whereTeacher as never,
    include: {
      courses: {
        where: { isActive: true },
        orderBy: { dayOfWeek: "asc" },
      },
    },
  }) as unknown as Array<{
    id: number;
    name: string;
    lineUserId: string | null;
    lineRegion: string | null;
    courses: Array<{ school: string; courseType: string; dayOfWeek: string; time: string }>;
  }>;

  let sent = 0;
  let skipped = 0;

  for (const teacher of teachers) {
    if (!teacher.lineUserId || !teacher.lineRegion) { skipped++; continue; }
    if (teacher.courses.length === 0) { skipped++; continue; }

    // Sort courses by day order
    const sorted = [...teacher.courses].sort(
      (a, b) => DAY_ORDER.indexOf(a.dayOfWeek) - DAY_ORDER.indexOf(b.dayOfWeek)
    );

    const cfg = getLineConfig(teacher.lineRegion as LineRegion);
    const msg = buildScheduleMessage({
      teacherName: teacher.name,
      weekLabel,
      courses: sorted,
    });

    await pushMessage(teacher.lineUserId, [msg], cfg.token);
    sent++;
  }

  return NextResponse.json({ ok: true, sent, skipped });
}
