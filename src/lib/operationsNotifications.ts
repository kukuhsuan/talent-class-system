import { prisma } from "@/lib/prisma";
import { getLineConfig, pushMessage } from "@/lib/line";
import type { LineRegion } from "@/lib/line";

export const OPERATIONS_RECIPIENTS = [
  { name: "黃一瀞", area: "north" as const, label: "北部" },
  { name: "鄭伃茵", area: "south" as const, label: "南部" },
  { name: "咕咕瑄", area: "all" as const, label: "全台" },
  { name: "Amber", area: "all" as const, label: "全台" },
];

let deliveryTableReady = false;
async function ensureOperationsDeliveryTable() {
  if (deliveryTableReady) return;
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS OperationsDailyDelivery (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      teacherId INTEGER NOT NULL,
      targetDate TEXT NOT NULL,
      dayOffset INTEGER NOT NULL DEFAULT 0,
      sentAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(teacherId, targetDate, dayOffset)
    )
  `);
  deliveryTableReady = true;
}

export async function operationsDailyWasSent(teacherId: number, targetDate: string, dayOffset: number) {
  await ensureOperationsDeliveryTable();
  const rows = await prisma.$queryRawUnsafe<Array<{ id: number }>>(
    `SELECT id FROM OperationsDailyDelivery
     WHERE teacherId = ? AND targetDate = ? AND dayOffset = ? LIMIT 1`,
    teacherId,
    targetDate,
    dayOffset,
  );
  return rows.length > 0;
}

export async function markOperationsDailySent(teacherId: number, targetDate: string, dayOffset: number) {
  await ensureOperationsDeliveryTable();
  await prisma.$executeRawUnsafe(
    `INSERT OR IGNORE INTO OperationsDailyDelivery (teacherId, targetDate, dayOffset)
     VALUES (?, ?, ?)`,
    teacherId,
    targetDate,
    dayOffset,
  );
}

export function operationsArea(region: unknown) {
  const value = String(region ?? "");
  return value.includes("南") || value.toLowerCase() === "south" ? "south" : "north";
}

export type OperationsBriefRow = { time: string; school: string; courseType: string; teachers: string };
export type OperationsAttentionItem = {
  level: "urgent" | "warning" | "notice";
  title: string;
  detail: string;
};

export function buildOperationsAttentionMessage(input: {
  areaLabel: string;
  dateIso: string;
  dayLabel: "今日" | "明日";
  items: OperationsAttentionItem[];
}) {
  const colors = {
    urgent: { bg: "#FFF0F1", accent: "#C83E4D", icon: "🔴" },
    warning: { bg: "#FFF7E8", accent: "#B96A12", icon: "🟠" },
    notice: { bg: "#FFFBEA", accent: "#8B7412", icon: "🟡" },
  } as const;
  const shown = input.items.slice(0, 10);
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/$/, "") || "https://talent-class-system.vercel.app";
  return {
    type: "flex",
    altText: `${input.areaLabel}${input.dayLabel}注意事項｜${input.items.length} 項待確認`,
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box", layout: "vertical", backgroundColor: "#27364A", paddingAll: "17px", spacing: "xs",
        contents: [
          { type: "text", text: `📌 ${input.areaLabel}${input.dayLabel}注意事項`, color: "#FFFFFF", weight: "bold", size: "lg" },
          { type: "text", text: `${input.dateIso}｜${input.items.length ? `${input.items.length} 項需要確認` : "目前沒有待處理項目"}`, color: "#D8E1EC", size: "xs" },
        ],
      },
      body: {
        type: "box", layout: "vertical", paddingAll: "14px", spacing: "sm",
        contents: shown.length ? [
          ...shown.map((item) => {
            const color = colors[item.level];
            return {
              type: "box", layout: "vertical", backgroundColor: color.bg, cornerRadius: "10px", paddingAll: "11px", spacing: "xs",
              contents: [
                { type: "text", text: `${color.icon} ${item.title}`, color: color.accent, weight: "bold", size: "sm", wrap: true },
                { type: "text", text: item.detail, color: "#68778A", size: "xs", wrap: true },
              ],
            };
          }),
          ...(input.items.length > shown.length ? [{ type: "text", text: `另有 ${input.items.length - shown.length} 項，請至系統查看`, size: "xs", color: "#8391A3", align: "center" }] : []),
        ] : [{
          type: "box", layout: "vertical", backgroundColor: "#EFF8F3", cornerRadius: "10px", paddingAll: "18px",
          contents: [{ type: "text", text: "✅ 資料完整，目前沒有待處理事項", align: "center", color: "#2F6654", weight: "bold", wrap: true }],
        }],
      },
      footer: {
        type: "box", layout: "horizontal", paddingAll: "12px", spacing: "sm",
        contents: [
          { type: "button", style: "secondary", height: "sm", action: { type: "uri", label: "出勤紀錄", uri: `${baseUrl}/attendance` } },
          { type: "button", style: "primary", height: "sm", color: "#315FA8", action: { type: "uri", label: "課程排班", uri: `${baseUrl}/courses` } },
        ],
      },
    },
  };
}

export function buildOperationsScheduleMessage(input: {
  areaLabel: string;
  dateIso: string;
  dayName: string;
  dayLabel: "今日" | "明日";
  preview?: boolean;
  rows: OperationsBriefRow[];
}) {
  const theme = input.areaLabel === "北部"
    ? { header: "#315FA8", pale: "#EEF5FF", accent: "#244D87", border: "#D5E5FA" }
    : input.areaLabel === "南部"
      ? { header: "#3F7D68", pale: "#EFF8F3", accent: "#2F6654", border: "#D5EADF" }
      : { header: "#6750A4", pale: "#F5F1FF", accent: "#513C8C", border: "#E2D9F7" };
  const pages = input.rows.length ? Array.from({ length: Math.ceil(input.rows.length / 8) }, (_, index) => input.rows.slice(index * 8, index * 8 + 8)) : [[]];
  const bubbles = pages.map((rows, pageIndex) => ({
    type: "bubble",
    size: "mega",
    header: {
      type: "box", layout: "vertical", backgroundColor: theme.header, paddingAll: "18px", spacing: "sm",
      contents: [
        { type: "text", text: `${input.areaLabel}${input.dayLabel}營運班表`, color: "#FFFFFF", weight: "bold", size: "xl" },
        { type: "text", text: `${input.dateIso} ${input.dayName}　共 ${input.rows.length} 堂`, color: "#EAF2FF", size: "sm" },
        ...(input.preview ? [{ type: "text", text: "測試預覽", color: "#FFFFFF", size: "xs", weight: "bold", align: "end", margin: "sm" }] : []),
      ],
    },
    body: {
      type: "box", layout: "vertical", backgroundColor: "#FFFFFF", paddingAll: "14px", spacing: "sm",
      contents: rows.length ? rows.map((row) => ({
        type: "box", layout: "horizontal", backgroundColor: theme.pale, cornerRadius: "10px", paddingAll: "11px", spacing: "md",
        contents: [
          { type: "text", text: row.time, size: "sm", color: theme.accent, weight: "bold", flex: 3, wrap: true },
          { type: "box", layout: "vertical", flex: 7, spacing: "xs", contents: [
            { type: "text", text: row.school, size: "sm", color: "#263548", weight: "bold", wrap: true },
            { type: "text", text: `${row.courseType}｜${row.teachers}`, size: "xs", color: "#68778A", wrap: true },
          ] },
        ],
      })) : [{
        type: "box", layout: "vertical", backgroundColor: theme.pale, cornerRadius: "10px", paddingAll: "18px",
        contents: [{ type: "text", text: "今天沒有排定課程 🎉", align: "center", color: theme.accent, weight: "bold" }],
      }],
    },
    footer: {
      type: "box", layout: "horizontal", backgroundColor: "#FAFBFC", paddingAll: "12px",
      contents: [
        { type: "text", text: "緊急異動將另行即時通知", size: "xxs", color: "#8391A3", flex: 8 },
        { type: "text", text: `${pageIndex + 1}/${pages.length}`, size: "xxs", color: "#8391A3", align: "end", flex: 2 },
      ],
    },
  }));
  return {
    type: "flex",
    altText: `${input.areaLabel}${input.dayLabel}營運班表｜${input.dateIso}｜${input.rows.length} 堂`,
    contents: bubbles.length === 1 ? bubbles[0] : { type: "carousel", contents: bubbles },
  };
}

export function buildOperationsAlertMessage(text: string) {
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  const first = lines.shift() || "緊急營運通知";
  const category = first.match(/【([^】]+)】/)?.[1] || "緊急通知";
  const title = first.replace(/^[^【]*【[^】]+】/, "").trim() || category;
  return {
    type: "flex",
    altText: `🚨 ${category}｜${title}`.slice(0, 400),
    contents: {
      type: "bubble",
      header: { type: "box", layout: "vertical", backgroundColor: "#C83E4D", paddingAll: "17px", contents: [
        { type: "text", text: `🚨 ${category}`, color: "#FFFFFF", weight: "bold", size: "lg" },
        { type: "text", text: "請儘速確認並處理", color: "#FFE8EB", size: "xs", margin: "sm" },
      ] },
      body: { type: "box", layout: "vertical", backgroundColor: "#FFF8F8", paddingAll: "17px", spacing: "md", contents: [
        { type: "text", text: title, color: "#57212A", weight: "bold", size: "md", wrap: true },
        { type: "separator", color: "#F0CDD2" },
        { type: "text", text: lines.join("\n") || "請至管理系統查看詳細資料。", color: "#6D4A50", size: "sm", wrap: true },
      ] },
    },
  };
}

export async function operationsRecipientRows() {
  const teachers = await prisma.teacher.findMany({
    where: { name: { in: OPERATIONS_RECIPIENTS.map((item) => item.name) } },
    select: { id: true, name: true, lineUserId: true, lineRegion: true },
  });
  return OPERATIONS_RECIPIENTS.map((setting) => ({
    ...setting,
    teacher: teachers.find((teacher) => teacher.name.trim() === setting.name) ?? null,
  }));
}

/** 營運人員皆即時收到緊急訊息，並使用本人綁定的 LINE OA。 */
export async function pushOperationsAlert(text: string) {
  const recipients = await operationsRecipientRows();
  let sent = 0;
  const sentLineUserIds: string[] = [];
  const errors: string[] = [];
  for (const item of recipients) {
    const teacher = item.teacher;
    if (!teacher?.lineUserId) {
      errors.push(`${item.name}：尚未綁定 LINE`);
      continue;
    }
    try {
      const region = (teacher.lineRegion || "north") as LineRegion;
      await pushMessage(teacher.lineUserId, [buildOperationsAlertMessage(text)], getLineConfig(region).token);
      sent++;
      sentLineUserIds.push(teacher.lineUserId);
    } catch (error) {
      errors.push(`${item.name}：${error instanceof Error ? error.message : "發送失敗"}`);
    }
  }
  return { sent, sentLineUserIds, errors };
}
