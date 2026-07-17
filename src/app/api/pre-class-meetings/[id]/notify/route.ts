import { NextRequest, NextResponse } from "next/server";
import { ensurePreClassMeetingTables, getMeetingById, meetingAttendees, notifyAttendee } from "@/lib/preClassMeeting";

/**
 * 發送會議通知。
 * body 無 teacherId：一鍵發送（需先確認名單），只發「未通知／通知失敗」者，避免重複通知。
 * body 有 teacherId：個別補發（不限狀態，管理者手動）。
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await ensurePreClassMeetingTables();
  const { id } = await params;
  const meeting = await getMeetingById(Number(id));
  if (!meeting) return NextResponse.json({ error: "找不到這場會議" }, { status: 404 });
  const data = await req.json().catch(() => ({}));
  const teacherId = Number(data.teacherId);
  const attendees = (await meetingAttendees(meeting.id)).filter((row) => Number(row.removed) !== 1);

  if (Number.isFinite(teacherId) && teacherId > 0) {
    const attendee = attendees.find((row) => row.teacherId === teacherId);
    if (!attendee) return NextResponse.json({ error: "這位老師不在參加名單中" }, { status: 404 });
    const result = await notifyAttendee(meeting, attendee);
    return result.ok
      ? NextResponse.json({ ok: true, sent: 1 })
      : NextResponse.json({ error: `補發失敗：${result.reason}` }, { status: 502 });
  }

  if (!meeting.confirmedAt) {
    return NextResponse.json({ error: "請先確認名單，確認後才能一鍵發送通知" }, { status: 409 });
  }
  const pending = attendees.filter((row) => row.notifyStatus !== "已通知");
  let sent = 0;
  const failures: string[] = [];
  for (const attendee of pending) {
    const result = await notifyAttendee(meeting, attendee);
    if (result.ok) sent += 1;
    else failures.push(`${result.teacherName}（${result.reason}）`);
  }
  return NextResponse.json({ ok: failures.length === 0, sent, skippedAlreadySent: attendees.length - pending.length, failures });
}
