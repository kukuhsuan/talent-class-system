import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { taipeiDateIso } from "@/lib/courseDates";
import {
  ensurePreClassMeetingTables,
  ensureUpcomingMeetings,
  meetingAttendees,
  normalizeMeetingRow,
  syncMeetingAttendees,
  type MeetingRow,
} from "@/lib/preClassMeeting";

export const maxDuration = 60;

// 課前會議清單（含參加者、下週課程明細、新增教練標示）
export async function GET(req: NextRequest) {
  await ensurePreClassMeetingTables();
  await ensureUpcomingMeetings();
  const limit = Math.min(20, Math.max(1, Number(req.nextUrl.searchParams.get("limit") ?? "6") || 6));
  const meetings = (await prisma.$queryRawUnsafe<MeetingRow[]>(
    "SELECT * FROM PreClassMeeting ORDER BY meetingDate DESC LIMIT ?",
    limit,
  )).map(normalizeMeetingRow);

  const today = taipeiDateIso();
  const result = await Promise.all(meetings.map(async (meeting) => {
    // 效能：只有「今天以後」的會議才做臨時教練同步；過往會議直接讀名單
    const isUpcoming = meeting.meetingDate >= today;
    const teacherMap = isUpcoming
      ? await syncMeetingAttendees(meeting.id, meeting.targetStart, meeting.targetEnd, "late")
      : new Map<number, { courses: Array<{ date: string; school: string; courseType: string; time: string }> }>();
    const attendees = await meetingAttendees(meeting.id);
    const teacherIds = attendees.map((row) => row.teacherId);
    const teachers = teacherIds.length
      ? await prisma.teacher.findMany({ where: { id: { in: teacherIds } }, select: { id: true, name: true, lineUserId: true } })
      : [];
    const teacherById = new Map(teachers.map((teacher) => [teacher.id, teacher]));
    return {
      ...meeting,
      attendees: attendees.map((row) => ({
        id: row.id,
        teacherId: row.teacherId,
        teacherName: teacherById.get(row.teacherId)?.name ?? `#${row.teacherId}`,
        hasLine: Boolean(teacherById.get(row.teacherId)?.lineUserId),
        source: row.source,
        removed: Number(row.removed) === 1,
        notifyStatus: row.notifyStatus,
        notifyError: row.notifyError,
        notifiedAt: row.notifiedAt,
        reply: row.reply,
        repliedAt: row.repliedAt,
        courses: teacherMap.get(row.teacherId)?.courses ?? [],
      })),
    };
  }));
  return NextResponse.json(result);
}

// 手動新增會議（可自訂日期、時間、目標週）
export async function POST(req: NextRequest) {
  await ensurePreClassMeetingTables();
  const data = await req.json();
  const meetingDate = String(data.meetingDate ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(meetingDate)) {
    return NextResponse.json({ error: "請提供正確的會議日期" }, { status: 400 });
  }
  const targetStart = String(data.targetStart ?? "").slice(0, 10);
  const targetEnd = String(data.targetEnd ?? "").slice(0, 10);
  await prisma.$executeRawUnsafe(
    `INSERT OR IGNORE INTO PreClassMeeting (meetingDate, startTime, endTime, meetLink, note, targetStart, targetEnd)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    meetingDate,
    String(data.startTime ?? "12:30"),
    String(data.endTime ?? "13:00"),
    String(data.meetLink ?? ""),
    String(data.note ?? ""),
    targetStart || meetingDate,
    targetEnd || meetingDate,
  );
  const rows = (await prisma.$queryRawUnsafe<MeetingRow[]>("SELECT * FROM PreClassMeeting WHERE meetingDate = ?", meetingDate)).map(normalizeMeetingRow);
  if (rows[0]) await syncMeetingAttendees(rows[0].id, rows[0].targetStart, rows[0].targetEnd, "auto");
  return NextResponse.json(rows[0] ?? { ok: true });
}
