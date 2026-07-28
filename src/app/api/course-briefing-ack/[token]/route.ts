import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCourseBriefingByToken } from "@/lib/courseBriefing";

export async function GET(_: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const row = await getCourseBriefingByToken((await params).token);
  if (!row) return NextResponse.json({ error: "連結無效或已失效" }, { status: 404 });
  return NextResponse.json({
    teacherName: row.teacherName,
    targetDate: row.targetDate,
    school: row.school,
    courseType: row.courseType,
    courseTime: row.courseTime,
    content: row.content,
    equipmentNote: row.equipmentNote,
    acknowledged: Boolean(row.ackAt),
  });
}

export async function POST(_: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const token = (await params).token;
  const row = await getCourseBriefingByToken(token);
  if (!row) return NextResponse.json({ error: "連結無效或已失效" }, { status: 404 });
  await prisma.$executeRawUnsafe(
    "UPDATE CourseBriefing SET ackAt = COALESCE(ackAt, CURRENT_TIMESTAMP) WHERE ackToken = ?",
    token,
  );
  return NextResponse.json({ ok: true });
}
