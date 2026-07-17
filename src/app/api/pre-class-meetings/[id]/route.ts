import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensurePreClassMeetingTables, getMeetingById } from "@/lib/preClassMeeting";

// 更新會議（改期、時間、連結、內容、確認名單）
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await ensurePreClassMeetingTables();
  const { id } = await params;
  const meetingId = Number(id);
  const meeting = await getMeetingById(meetingId);
  if (!meeting) return NextResponse.json({ error: "找不到這場會議" }, { status: 404 });
  const data = await req.json();

  const fields: string[] = [];
  const values: unknown[] = [];
  const setText = (key: "meetingDate" | "startTime" | "endTime" | "meetLink" | "note" | "targetStart" | "targetEnd") => {
    if (typeof data[key] === "string") { fields.push(`${key} = ?`); values.push(String(data[key]).trim()); }
  };
  setText("meetingDate"); setText("startTime"); setText("endTime"); setText("meetLink"); setText("note"); setText("targetStart"); setText("targetEnd");
  if (data.confirmed === true) fields.push("confirmedAt = CURRENT_TIMESTAMP");
  if (data.confirmed === false) fields.push("confirmedAt = NULL");
  if (fields.length === 0) return NextResponse.json(meeting);
  await prisma.$executeRawUnsafe(`UPDATE PreClassMeeting SET ${fields.join(", ")} WHERE id = ?`, ...values, meetingId);
  return NextResponse.json(await getMeetingById(meetingId));
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await ensurePreClassMeetingTables();
  const { id } = await params;
  const meetingId = Number(id);
  await prisma.$executeRawUnsafe("DELETE FROM PreClassMeetingAttendee WHERE meetingId = ?", meetingId);
  await prisma.$executeRawUnsafe("DELETE FROM PreClassMeeting WHERE id = ?", meetingId);
  return NextResponse.json({ ok: true });
}
