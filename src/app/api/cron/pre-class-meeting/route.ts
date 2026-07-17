import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createTransport } from "@/lib/mailer";
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

function appUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "https://talent-class-system.vercel.app").replace(/\/$/, "");
}

/**
 * task=generate（週四）：自動建立近期會議＋產生下週有課教練名單，寄信提醒行政確認（不直接通知教練）。
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

    // 提醒行政人員到後台確認名單（確認後才能發送）
    const to = process.env.BACKUP_EMAIL || process.env.GMAIL_USER;
    let mailed = false;
    if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD && to) {
      try {
        await createTransport().sendMail({
          from: `WaysLeader AI 課前會議 <${process.env.GMAIL_USER}>`,
          to,
          subject: `課前會議名單已產生，請確認（${summaries.length} 場）`,
          html: `
            <div style="font-family: Arial, sans-serif; line-height: 1.7;">
              <h2>課前會議名單已產生</h2>
              <ul>${summaries.map((line) => `<li>${line}</li>`).join("")}</ul>
              <p>請到後台「課前會議」頁確認名單後，再按「一鍵發送通知」。系統不會自動通知教練。</p>
              <p><a href="${appUrl()}/pre-class-meeting">前往課前會議頁</a></p>
            </div>
          `,
        });
        mailed = true;
      } catch (error) {
        console.error("pre-class meeting admin mail failed", error);
      }
    }
    return NextResponse.json({ ok: true, task, meetings: summaries, adminMailed: mailed });
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
