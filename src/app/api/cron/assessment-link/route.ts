import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { signPublicAccessToken } from "@/lib/publicAccessToken";

function dayBounds(iso: string) {
  const start = new Date(`${iso}T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const teacherName = String(body.teacherName ?? "").trim();
  const school = String(body.school ?? "").trim();
  const date = String(body.date ?? "").slice(0, 10);
  if (!teacherName || !school || !date) {
    return NextResponse.json({ error: "請提供 teacherName、school、date" }, { status: 400 });
  }

  const { start, end } = dayBounds(date);
  const rows = await prisma.attendance.findMany({
    where: {
      date: { gte: start, lt: end },
      cancelled: false,
      course: { school: { contains: school } },
      actualTeacher: { name: { contains: teacherName } },
    },
    include: {
      course: { select: { school: true, courseType: true, department: true } },
      actualTeacher: { select: { name: true } },
    },
    orderBy: { id: "asc" },
  });

  if (rows.length === 0) {
    return NextResponse.json({ error: "找不到符合條件的出勤紀錄" }, { status: 404 });
  }

  const baseUrl = new URL(req.url).origin;
  const matches = rows.map((row) => ({
    attendanceId: row.id,
    date: row.date.toISOString().slice(0, 10),
    teacherName: row.actualTeacher.name,
    school: row.course.school,
    courseType: row.course.courseType,
    department: row.course.department,
    assessmentUrl: `${baseUrl}/assessment/${encodeURIComponent(signPublicAccessToken("assessment", row.id))}`,
    reportUrl: `${baseUrl}/report/${encodeURIComponent(signPublicAccessToken("report", row.id))}`,
  }));

  return NextResponse.json({
    ok: true,
    count: matches.length,
    match: matches[0],
    matches,
  });
}
