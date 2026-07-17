import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensurePreClassMeetingTables, getMeetingById } from "@/lib/preClassMeeting";

// 手動新增參加教練
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await ensurePreClassMeetingTables();
  const { id } = await params;
  const meetingId = Number(id);
  if (!(await getMeetingById(meetingId))) return NextResponse.json({ error: "找不到這場會議" }, { status: 404 });
  const data = await req.json();
  const teacherId = Number(data.teacherId);
  if (!Number.isFinite(teacherId)) return NextResponse.json({ error: "請選擇老師" }, { status: 400 });
  const teacher = await prisma.teacher.findUnique({ where: { id: teacherId }, select: { id: true } });
  if (!teacher) return NextResponse.json({ error: "找不到這位老師" }, { status: 404 });
  await prisma.$executeRawUnsafe(
    "INSERT OR IGNORE INTO PreClassMeetingAttendee (meetingId, teacherId, source) VALUES (?, ?, 'manual')",
    meetingId, teacherId,
  );
  // 若先前被移除，重新加入
  await prisma.$executeRawUnsafe(
    "UPDATE PreClassMeetingAttendee SET removed = 0 WHERE meetingId = ? AND teacherId = ?",
    meetingId, teacherId,
  );
  return NextResponse.json({ ok: true });
}

// 移除參加教練（保留紀錄避免自動同步再加回來）
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await ensurePreClassMeetingTables();
  const { id } = await params;
  const meetingId = Number(id);
  const data = await req.json().catch(() => ({}));
  const teacherId = Number(data.teacherId);
  if (!Number.isFinite(teacherId)) return NextResponse.json({ error: "請指定老師" }, { status: 400 });
  await prisma.$executeRawUnsafe(
    "UPDATE PreClassMeetingAttendee SET removed = 1 WHERE meetingId = ? AND teacherId = ?",
    meetingId, teacherId,
  );
  return NextResponse.json({ ok: true });
}
