import { prisma } from "@/lib/prisma";
import { getLineConfig, pushMessage, type LineRegion } from "@/lib/line";
import { courseDateWindowWhere, courseIdsWithAnyAttendance, dayBounds, dayNameOfIso } from "@/lib/scheduleLogic";
import { taipeiDateIso } from "@/lib/courseDates";

// 課前會議：每週五 12:30–13:00 線上會議，通知下週有課教練。
// 特殊安排：2026-07-20（一）通知本週(7/20–7/26)有課教練；2026-07-24（五）通知下週(7/27–8/2)。

export const DEFAULT_MEET_LINK = "https://meet.google.com/gmd-obun-vbf";
export const DEFAULT_MEETING_START = "12:30";
export const DEFAULT_MEETING_END = "13:00";

let tablesReady = false;
export async function ensurePreClassMeetingTables() {
  if (tablesReady) return;
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS PreClassMeeting (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      meetingDate TEXT NOT NULL,
      startTime TEXT NOT NULL DEFAULT '12:30',
      endTime TEXT NOT NULL DEFAULT '13:00',
      meetLink TEXT NOT NULL DEFAULT '',
      note TEXT NOT NULL DEFAULT '',
      targetStart TEXT NOT NULL,
      targetEnd TEXT NOT NULL,
      confirmedAt DATETIME,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(meetingDate)
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS PreClassMeetingAttendee (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      meetingId INTEGER NOT NULL,
      teacherId INTEGER NOT NULL,
      source TEXT NOT NULL DEFAULT 'auto',
      removed INTEGER NOT NULL DEFAULT 0,
      notifyStatus TEXT NOT NULL DEFAULT '未通知',
      notifyError TEXT NOT NULL DEFAULT '',
      notifiedAt DATETIME,
      reply TEXT NOT NULL DEFAULT '尚未回覆',
      repliedAt DATETIME,
      UNIQUE(meetingId, teacherId)
    )
  `);
  tablesReady = true;
}

export type MeetingRow = {
  id: number;
  meetingDate: string;
  startTime: string;
  endTime: string;
  meetLink: string;
  note: string;
  targetStart: string;
  targetEnd: string;
  confirmedAt: string | null;
  createdAt: string;
};

export type AttendeeRow = {
  id: number;
  meetingId: number;
  teacherId: number;
  source: string;
  removed: number;
  notifyStatus: string;
  notifyError: string;
  notifiedAt: string | null;
  reply: string;
  repliedAt: string | null;
};

// raw 查詢的 INTEGER 會是 BigInt，統一轉 number 避免 JSON 序列化錯誤
export function normalizeMeetingRow(row: MeetingRow): MeetingRow {
  return { ...row, id: Number(row.id) };
}

export function normalizeAttendeeRow(row: AttendeeRow): AttendeeRow {
  return { ...row, id: Number(row.id), meetingId: Number(row.meetingId), teacherId: Number(row.teacherId), removed: Number(row.removed) };
}

export function addIsoDays(iso: string, days: number) {
  const date = new Date(`${iso}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

// 週一為一週起點
export function weekMondayOf(iso: string) {
  const date = new Date(`${iso}T00:00:00.000Z`);
  const day = date.getUTCDay(); // 0=日
  const diff = day === 0 ? -6 : 1 - day;
  return addIsoDays(iso, diff);
}

// 一般規則：會議通知「下週」課程（會議日期所屬週的下一週，一～日）
export function defaultTargetWeek(meetingDateIso: string) {
  const nextMonday = addIsoDays(weekMondayOf(meetingDateIso), 7);
  return { targetStart: nextMonday, targetEnd: addIsoDays(nextMonday, 6) };
}

// 下一場固定會議（週五）；含 2026/07 特殊安排
export function upcomingMeetingSpecs(todayIso: string) {
  const specs: Array<{ meetingDate: string; targetStart: string; targetEnd: string }> = [];
  const specials = [
    { meetingDate: "2026-07-20", targetStart: "2026-07-20", targetEnd: "2026-07-26" },
    { meetingDate: "2026-07-24", targetStart: "2026-07-27", targetEnd: "2026-08-02" },
  ];
  for (const special of specials) {
    if (special.meetingDate >= todayIso && addIsoDays(todayIso, 7) >= special.meetingDate) specs.push(special);
  }
  // 下一個週五（非特殊日才自動建立）
  const date = new Date(`${todayIso}T00:00:00.000Z`);
  const day = date.getUTCDay();
  const daysToFriday = (5 - day + 7) % 7; // 今天是週五則為 0
  const friday = addIsoDays(todayIso, daysToFriday);
  if (!specials.some((special) => special.meetingDate === friday)) {
    specs.push({ meetingDate: friday, ...defaultTargetWeek(friday) });
  }
  return specs;
}

export async function getMeetingById(id: number) {
  await ensurePreClassMeetingTables();
  const rows = await prisma.$queryRawUnsafe<MeetingRow[]>("SELECT * FROM PreClassMeeting WHERE id = ?", id);
  return rows[0] ? normalizeMeetingRow(rows[0]) : null;
}

export async function createMeetingIfMissing(spec: { meetingDate: string; targetStart: string; targetEnd: string }) {
  await ensurePreClassMeetingTables();
  await prisma.$executeRawUnsafe(
    `INSERT OR IGNORE INTO PreClassMeeting (meetingDate, startTime, endTime, meetLink, targetStart, targetEnd)
     VALUES (?, ?, ?, ?, ?, ?)`,
    spec.meetingDate, DEFAULT_MEETING_START, DEFAULT_MEETING_END, DEFAULT_MEET_LINK, spec.targetStart, spec.targetEnd,
  );
  const rows = await prisma.$queryRawUnsafe<MeetingRow[]>("SELECT * FROM PreClassMeeting WHERE meetingDate = ?", spec.meetingDate);
  return normalizeMeetingRow(rows[0]);
}

export type WeekTeacher = {
  teacher: { id: number; name: string; lineUserId: string | null; lineRegion: string };
  courses: Array<{ date: string; school: string; courseType: string; time: string }>;
};

// 目標週（targetStart~targetEnd）內有「安親班」課的教練與其課程（含主教與助教；已排出勤＋每週固定課）
// 只通知安親班：幼兒園課程不列入；教練若同時有安親班課仍會列入
const AFTER_SCHOOL_ONLY = { department: { contains: "安親" } } as const;
export async function weekTeacherMap(targetStart: string, targetEnd: string) {
  const byTeacher = new Map<number, WeekTeacher>();
  const push = (teacher: { id: number; name: string; lineUserId: string | null; lineRegion: string } | null | undefined, course: { date: string; school: string; courseType: string; time: string }) => {
    if (!teacher || teacher.name === "待排老師") return;
    const item = byTeacher.get(teacher.id) ?? { teacher, courses: [] };
    if (!item.courses.some((row) => row.date === course.date && row.school === course.school && row.courseType === course.courseType)) {
      item.courses.push(course);
    }
    byTeacher.set(teacher.id, item);
  };

  // 效能：各天平行查詢，避免遠端資料庫序列來回造成頁面載入過慢
  const days: string[] = [];
  for (let offset = 0; ; offset += 1) {
    const iso = addIsoDays(targetStart, offset);
    if (iso > targetEnd || days.length >= 14) break;
    days.push(iso);
  }
  // 「已有排定出勤」的課程整週只查一次（原本每天各掃一次 Attendance，是逾時主因之一）
  const datedCourseIds = await courseIdsWithAnyAttendance(
    { isActive: true, ...AFTER_SCHOOL_ONLY },
    new Date(`${targetStart}T00:00:00.000Z`),
  );
  const results = await Promise.all(days.map(async (iso) => {
    const { start, end } = dayBounds(iso);
    const dayName = dayNameOfIso(iso);
    const window = courseDateWindowWhere(iso);
    const [attendances, weekly] = await Promise.all([
      prisma.attendance.findMany({
        where: { cancelled: false, date: { gte: start, lt: end }, course: { isActive: true, ...AFTER_SCHOOL_ONLY, ...window } },
        include: {
          course: { select: { school: true, courseType: true, time: true } },
          actualTeacher: { select: { id: true, name: true, lineUserId: true, lineRegion: true } },
          assistantTeacher: { select: { id: true, name: true, lineUserId: true, lineRegion: true } },
        },
      }),
      prisma.course.findMany({
        where: { isActive: true, ...AFTER_SCHOOL_ONLY, ...window, dayOfWeek: dayName, ...(datedCourseIds.size > 0 ? { id: { notIn: [...datedCourseIds] } } : {}) },
        include: {
          teacher: { select: { id: true, name: true, lineUserId: true, lineRegion: true } },
          assistantTeacher: { select: { id: true, name: true, lineUserId: true, lineRegion: true } },
        },
      }),
    ]);
    return { iso, attendances, weekly };
  }));
  for (const { iso, attendances, weekly } of results) {
    for (const att of attendances) {
      const course = { date: iso, school: att.course.school, courseType: att.course.courseType, time: att.scheduledTime || att.course.time || "" };
      push(att.actualTeacher, course);
      push(att.assistantTeacher, course);
    }
    for (const row of weekly) {
      const course = { date: iso, school: row.school, courseType: row.courseType, time: row.time || "" };
      push(row.teacher, course);
      push(row.assistantTeacher, course);
    }
  }
  return byTeacher;
}

// 同步名單：目標週內新出現的教練補進參加者（source=late，狀態未通知＝「新增教練尚未通知」）
export async function syncMeetingAttendees(meetingId: number, targetStart: string, targetEnd: string, source: "auto" | "late") {
  await ensurePreClassMeetingTables();
  const teacherMap = await weekTeacherMap(targetStart, targetEnd);
  await Promise.all([...teacherMap.values()].map(({ teacher }) =>
    prisma.$executeRawUnsafe(
      "INSERT OR IGNORE INTO PreClassMeetingAttendee (meetingId, teacherId, source) VALUES (?, ?, ?)",
      meetingId, teacher.id, source,
    ),
  ));
  return teacherMap;
}

export async function meetingAttendees(meetingId: number) {
  await ensurePreClassMeetingTables();
  const rows = await prisma.$queryRawUnsafe<AttendeeRow[]>(
    "SELECT * FROM PreClassMeetingAttendee WHERE meetingId = ? ORDER BY id ASC",
    meetingId,
  );
  return rows.map(normalizeAttendeeRow);
}

export function meetingDateLabel(iso: string) {
  const date = new Date(`${iso}T00:00:00.000Z`);
  const weekday = ["日", "一", "二", "三", "四", "五", "六"][date.getUTCDay()];
  return `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}（${weekday}）`;
}

// 通知訊息：運動班長－課前會議通知（含會參加/無法參加按鈕）
export function buildMeetingInviteMessage(opts: {
  meeting: MeetingRow;
  attendeeId: number;
  isReminder?: boolean;
}) {
  const { meeting, attendeeId } = opts;
  const sameWeek = weekMondayOf(meeting.targetStart) === weekMondayOf(meeting.meetingDate);
  const weekLabel = sameWeek ? "本週" : "下週";
  const timeText = `${meetingDateLabel(meeting.meetingDate)} ${meeting.startTime}～${meeting.endTime}`;
  const intro = opts.isReminder
    ? `教練您好，提醒您今日 ${meeting.startTime} 的課前會議即將開始，請記得準時上線，並點選下方回覆出席狀態，謝謝。`
    : `教練您好，提醒您${weekLabel}有安排課程，請參加線上課前會議，會議時間約 30 分鐘，主要說明${weekLabel}課程的注意事項，請準時上線參加，謝謝。`;
  return {
    type: "flex",
    altText: `運動班長－課前會議通知 ${timeText}`,
    contents: {
      type: "bubble",
      header: {
        type: "box", layout: "vertical", backgroundColor: "#6B8FAB", paddingAll: "16px",
        contents: [{ type: "text", text: "運動班長－課前會議通知", color: "#FFFFFF", weight: "bold", size: "lg", wrap: true }],
      },
      body: {
        type: "box", layout: "vertical", spacing: "md", paddingAll: "16px", backgroundColor: "#FFFFFF",
        contents: [
          { type: "text", text: intro, size: "sm", color: "#555555", wrap: true },
          {
            type: "box", layout: "vertical", spacing: "xs", backgroundColor: "#F5F9FC", cornerRadius: "10px", paddingAll: "13px",
            contents: [
              { type: "text", text: `會議時間：${timeText}`, size: "sm", weight: "bold", color: "#47718F", wrap: true },
              ...(meeting.note ? [{ type: "text", text: meeting.note, size: "xs", color: "#555555", wrap: true, margin: "sm" }] : []),
            ],
          },
        ],
      },
      footer: {
        type: "box", layout: "vertical", paddingAll: "14px", backgroundColor: "#F5F9FC", spacing: "sm",
        contents: [
          {
            type: "button", style: "primary", color: "#2C82B8", height: "sm",
            action: { type: "uri", label: "加入視訊會議", uri: meeting.meetLink || DEFAULT_MEET_LINK },
          },
          {
            type: "box", layout: "horizontal", spacing: "sm",
            contents: [
              {
                type: "button", style: "primary", color: "#3E8E5A", height: "sm",
                action: { type: "postback", label: "會參加", data: `action=meeting_reply&attId=${attendeeId}&reply=yes`, displayText: "會參加課前會議" },
              },
              {
                type: "button", style: "secondary", height: "sm",
                action: { type: "postback", label: "無法參加", data: `action=meeting_reply&attId=${attendeeId}&reply=no`, displayText: "無法參加課前會議" },
              },
            ],
          },
        ],
      },
    },
  };
}

// 發送通知給單一參加者；回傳結果並更新通知狀態
export async function notifyAttendee(meeting: MeetingRow, attendee: AttendeeRow, opts?: { isReminder?: boolean }) {
  const teacher = await prisma.teacher.findUnique({
    where: { id: attendee.teacherId },
    select: { id: true, name: true, lineUserId: true, lineRegion: true },
  });
  const fail = async (reason: string) => {
    // 當日催覆失敗不改主要通知狀態（主要通知仍算已送達）
    if (!opts?.isReminder) {
      await prisma.$executeRawUnsafe(
        "UPDATE PreClassMeetingAttendee SET notifyStatus = '通知失敗', notifyError = ? WHERE id = ?",
        reason, attendee.id,
      );
    }
    return { ok: false as const, teacherName: teacher?.name ?? `#${attendee.teacherId}`, reason };
  };
  if (!teacher) return fail("找不到老師資料");
  if (!teacher.lineUserId) return fail("老師尚未綁定 LINE");
  const token = getLineConfig((teacher.lineRegion || "north") as LineRegion).token;
  try {
    await pushMessage(teacher.lineUserId, [buildMeetingInviteMessage({ meeting, attendeeId: attendee.id, isReminder: opts?.isReminder })], token);
    if (!opts?.isReminder) {
      await prisma.$executeRawUnsafe(
        "UPDATE PreClassMeetingAttendee SET notifyStatus = '已通知', notifyError = '', notifiedAt = CURRENT_TIMESTAMP WHERE id = ?",
        attendee.id,
      );
    }
    return { ok: true as const, teacherName: teacher.name };
  } catch (error) {
    return fail((error as Error).message || "LINE 發送失敗");
  }
}

// 確保近期會議存在並回傳（後台頁與週四 cron 共用）
export async function ensureUpcomingMeetings() {
  await ensurePreClassMeetingTables();
  const today = taipeiDateIso();
  const meetings: MeetingRow[] = [];
  for (const spec of upcomingMeetingSpecs(today)) {
    meetings.push(await createMeetingIfMissing(spec));
  }
  return meetings;
}
