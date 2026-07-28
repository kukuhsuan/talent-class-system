import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { getLineConfig, pushMessage } from "@/lib/line";
import type { LineRegion } from "@/lib/line";

export type CourseBriefingRow = {
  id: number;
  courseId: number;
  teacherId: number;
  targetDate: string;
  content: string;
  equipmentNote: string;
  status: string;
  ackToken: string;
  ackAt: string | null;
  createdBy: string;
  createdAt: string;
  immediateSentAt: string | null;
  dayBeforeSentAt: string | null;
  sameDaySentAt: string | null;
  courseCode: string;
  school: string;
  courseType: string;
  courseTime: string;
  teacherName: string;
  teacherLineUserId: string | null;
  teacherLineRegion: string;
};

export async function ensureCourseBriefingTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS CourseBriefing (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      courseId INTEGER NOT NULL,
      teacherId INTEGER NOT NULL,
      targetDate TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      equipmentNote TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      ackToken TEXT NOT NULL UNIQUE,
      ackAt DATETIME,
      createdBy TEXT NOT NULL DEFAULT '',
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      immediateSentAt DATETIME,
      dayBeforeSentAt DATETIME,
      sameDaySentAt DATETIME
    )
  `);
  await prisma.$executeRawUnsafe("CREATE INDEX IF NOT EXISTS idx_course_briefing_date ON CourseBriefing(targetDate, status)");
}

const SELECT_SQL = `
  SELECT b.*, c.code AS courseCode, c.school, c.courseType, c.time AS courseTime,
         t.name AS teacherName, t.lineUserId AS teacherLineUserId, t.lineRegion AS teacherLineRegion
  FROM CourseBriefing b
  JOIN Course c ON c.id = b.courseId
  JOIN Teacher t ON t.id = b.teacherId
`;

export async function listCourseBriefings(opts?: { from?: string; to?: string; limit?: number }) {
  await ensureCourseBriefingTable();
  const where: string[] = [];
  const args: Array<string | number> = [];
  if (opts?.from) { where.push("b.targetDate >= ?"); args.push(opts.from); }
  if (opts?.to) { where.push("b.targetDate <= ?"); args.push(opts.to); }
  const limit = Math.max(1, Math.min(200, opts?.limit ?? 100));
  return prisma.$queryRawUnsafe<CourseBriefingRow[]>(
    `${SELECT_SQL}${where.length ? ` WHERE ${where.join(" AND ")}` : ""} ORDER BY b.targetDate ASC, c.time ASC LIMIT ?`,
    ...args,
    limit,
  );
}

export async function getCourseBriefing(id: number) {
  await ensureCourseBriefingTable();
  return (await prisma.$queryRawUnsafe<CourseBriefingRow[]>(
    `${SELECT_SQL} WHERE b.id = ? LIMIT 1`,
    id,
  ))[0] ?? null;
}

export async function getCourseBriefingByToken(token: string) {
  await ensureCourseBriefingTable();
  return (await prisma.$queryRawUnsafe<CourseBriefingRow[]>(
    `${SELECT_SQL} WHERE b.ackToken = ? LIMIT 1`,
    token,
  ))[0] ?? null;
}

export async function createCourseBriefing(input: {
  courseId: number;
  teacherId: number;
  targetDate: string;
  content: string;
  equipmentNote?: string;
  createdBy?: string;
}) {
  await ensureCourseBriefingTable();
  const token = crypto.randomBytes(20).toString("hex");
  await prisma.$executeRawUnsafe(
    `INSERT INTO CourseBriefing
     (courseId, teacherId, targetDate, content, equipmentNote, ackToken, createdBy)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    input.courseId, input.teacherId, input.targetDate, input.content.trim(),
    input.equipmentNote?.trim() ?? "", token, input.createdBy ?? "",
  );
  return getCourseBriefingByToken(token);
}

function reminderLabel(kind: "immediate" | "dayBefore" | "sameDay") {
  if (kind === "dayBefore") return "明日課程交辦提醒";
  if (kind === "sameDay") return "今日課程交辦提醒";
  return "課前交辦通知";
}

export function buildCourseBriefingMessage(row: CourseBriefingRow, kind: "immediate" | "dayBefore" | "sameDay") {
  const detailLines = [
    `日期：${row.targetDate}`,
    `園所：${row.school}`,
    `課程：${row.courseType}`,
    `時間：${row.courseTime || "時間未填"}`,
  ];
  if (row.equipmentNote) detailLines.push(`器材：${row.equipmentNote}`);
  return {
    type: "flex",
    altText: `${reminderLabel(kind)}｜${row.school}`,
    contents: {
      type: "bubble",
      header: {
        type: "box", layout: "vertical", backgroundColor: kind === "sameDay" ? "#DC6B2F" : "#315FA8", paddingAll: "18px",
        contents: [{ type: "text", text: `📌 ${reminderLabel(kind)}`, color: "#FFFFFF", weight: "bold", size: "lg" }],
      },
      body: {
        type: "box", layout: "vertical", paddingAll: "18px", spacing: "md",
        contents: [
          { type: "text", text: `${row.teacherName} 老師您好`, weight: "bold", color: "#263548", size: "md" },
          { type: "text", text: detailLines.join("\n"), wrap: true, color: "#526277", size: "sm", lineSpacing: "5px" },
          { type: "separator" },
          { type: "text", text: row.content, wrap: true, color: "#1F2937", size: "md", lineSpacing: "6px" },
        ],
      },
      footer: {
        type: "box", layout: "vertical", paddingAll: "14px",
        contents: [{
          type: "button", style: "primary", color: row.ackAt ? "#64748B" : "#16A34A",
          action: {
            type: "postback",
            label: row.ackAt ? "已確認收到" : "✅ 確認收到",
            data: `action=course_briefing_ack&t=${row.ackToken}`,
            displayText: "我已閱讀並確認收到",
          },
        }],
      },
    },
  };
}

export async function confirmCourseBriefingByLineUser(token: string, lineUserId: string) {
  const row = await getCourseBriefingByToken(token);
  if (!row || !lineUserId || row.teacherLineUserId !== lineUserId) return { ok: false as const };
  if (row.ackAt) return { ok: true as const, already: true as const, row };
  await prisma.$executeRawUnsafe(
    "UPDATE CourseBriefing SET ackAt = CURRENT_TIMESTAMP WHERE ackToken = ? AND ackAt IS NULL",
    token,
  );
  return { ok: true as const, already: false as const, row };
}

export async function sendCourseBriefing(row: CourseBriefingRow, kind: "immediate" | "dayBefore" | "sameDay") {
  if (!row.teacherLineUserId) throw new Error(`${row.teacherName} 尚未綁定 LINE`);
  const region = (row.teacherLineRegion || "north") as LineRegion;
  const token = getLineConfig(region).token;
  if (!token) throw new Error(`${row.teacherName} 的 LINE 官方帳號尚未設定`);
  await pushMessage(row.teacherLineUserId, [buildCourseBriefingMessage(row, kind)], token);
  const column = kind === "immediate" ? "immediateSentAt" : kind === "dayBefore" ? "dayBeforeSentAt" : "sameDaySentAt";
  await prisma.$executeRawUnsafe(`UPDATE CourseBriefing SET ${column} = CURRENT_TIMESTAMP WHERE id = ?`, row.id);
}
