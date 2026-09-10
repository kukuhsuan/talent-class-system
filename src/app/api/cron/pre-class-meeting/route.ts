import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { taipeiDateIso } from "@/lib/courseDates";
import {
  ensurePreClassMeetingTables,
  ensureUpcomingMeetings,
  meetingAttendees,
  meetingDateLabel,
  normalizeMeetingRow,
  notifyAttendee,
  syncMeetingAttendees,
  type MeetingRow,
} from "@/lib/preClassMeeting";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * task=generate（週四）：靜默建立近期會議＋產生下週有課教練名單，不寄送行政提醒。
 * task=remind（每日早上）：若今天有會議，補同步臨時新增教練，並提醒「已通知但尚未回覆」的教練。
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await ensurePreClassMeetingTables();
  const task = req.nextUrl.searchParams.get("task") ?? "generate";

  if (task === "generate") {
    const meetings = await ensureUpcomingMeetings();
    const summaries: string[] = [];
    for (const meeting of meetings) {
      await syncMeetingAttendees(meeting.id, meeting.targetStart, meeting.targetEnd, "auto");
      const attendees = (await meetingAttendees(meeting.id)).filter((row) => Number(row.removed) !== 1);
      summaries.push(`${meetingDateLabel(meeting.meetingDate)} ${meeting.startTime}～${meeting.endTime}：應參加 ${attendees.length} 位`);
    }

    return NextResponse.json({ ok: true, task, meetings: summaries, adminMailed: false });
  }

  if (task === "remind") {
    const today = taipeiDateIso();
    const meetings = (await prisma.$queryRawUnsafe<MeetingRow[]>(
      "SELECT * FROM PreClassMeeting WHERE meetingDate = ?",
      today,
    )).map(normalizeMeetingRow);
    let reminded = 0;
    const failures: string[] = [];
    for (const meeting of meetings) {
      // 臨時新增課程的教練補進名單（頁面會標示「新增教練尚未通知」，不自動發）
      await syncMeetingAttendees(meeting.id, meeting.targetStart, meeting.targetEnd, "late");
      const attendees = await meetingAttendees(meeting.id);
      const targets = attendees.filter((row) => Number(row.removed) !== 1 && row.notifyStatus === "已通知" && row.reply === "尚未回覆");
      for (const attendee of targets) {
        const result = await notifyAttendee(meeting, attendee, { isReminder: true });
        if (result.ok) reminded += 1;
        else failures.push(`${result.teacherName}（${result.reason}）`);
      }
    }
    return NextResponse.json({ ok: failures.length === 0, task, meetingsToday: meetings.length, reminded, failures });
  }

  return NextResponse.json({ error: "未知的 task" }, { status: 400 });
}
