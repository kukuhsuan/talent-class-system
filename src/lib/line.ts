import crypto from "crypto";

export type LineRegion = "north" | "south" | "school";

export function getLineConfig(region: LineRegion) {
  const configs = {
    north: {
      secret: process.env.LINE_NORTH_SECRET ?? "",
      token: process.env.LINE_NORTH_TOKEN ?? "",
    },
    south: {
      secret: process.env.LINE_SOUTH_SECRET ?? "",
      token: process.env.LINE_SOUTH_TOKEN ?? "",
    },
    school: {
      secret: process.env.LINE_SCHOOL_SECRET ?? "",
      token: process.env.LINE_SCHOOL_TOKEN ?? "",
    },
  };
  return configs[region];
}

export function verifyLineSignature(body: string, signature: string, secret: string): boolean {
  const hmac = crypto.createHmac("SHA256", secret);
  hmac.update(body);
  return hmac.digest("base64") === signature;
}

export async function replyMessage(replyToken: string, messages: object[], token: string) {
  const res = await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
    body: JSON.stringify({ replyToken, messages }),
  });
  if (!res.ok) console.error("LINE reply error:", await res.text());
}

export async function pushMessage(to: string, messages: object[], token: string) {
  const res = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
    body: JSON.stringify({ to, messages }),
  });
  if (!res.ok) console.error("LINE push error:", await res.text());
}

// Build a class reminder message for teacher
export function buildReminderMessage(opts: {
  teacherName: string;
  school: string;
  courseType: string;
  time: string;
  date: string;
  dayOfWeek: string;
}) {
  return {
    type: "flex",
    altText: `明日課程提醒：${opts.school} ${opts.courseType}`,
    contents: {
      type: "bubble",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#1E40AF",
        contents: [{ type: "text", text: "課程提醒", color: "#ffffff", weight: "bold", size: "lg" }],
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        contents: [
          { type: "text", text: `老師：${opts.teacherName}`, size: "md", weight: "bold" },
          { type: "text", text: `日期：${opts.date}（${opts.dayOfWeek}）`, size: "sm", color: "#555555" },
          { type: "text", text: `時間：${opts.time || "待確認"}`, size: "sm", color: "#555555" },
          { type: "text", text: `地點：${opts.school}`, size: "sm", color: "#555555" },
          { type: "text", text: `課程：${opts.courseType}`, size: "sm", color: "#555555" },
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        contents: [{
          type: "text",
          text: "請準時出席，謝謝！",
          size: "xs",
          color: "#888888",
          align: "center",
        }],
      },
    },
  };
}

// Build post-class report request (cream/coffee theme)
export function buildReportRequestMessage(opts: {
  school: string;
  courseType: string;
  attendanceId: number;
}) {
  return {
    type: "flex",
    altText: `請回報 ${opts.school} ${opts.courseType} 課程狀況`,
    contents: {
      type: "bubble",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#6F4E37",
        paddingAll: "16px",
        contents: [
          { type: "text", text: "☕ 課程回報", color: "#FDF6EE", weight: "bold", size: "lg" },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#FDF6EE",
        spacing: "sm",
        paddingAll: "16px",
        contents: [
          { type: "text", text: opts.school, weight: "bold", color: "#4A2C17", size: "lg" },
          { type: "text", text: `課程：${opts.courseType}`, size: "sm", color: "#8B6347" },
          { type: "separator", margin: "md", color: "#E8D5C0" },
          { type: "text", text: "請選擇今日課程狀況：", size: "sm", color: "#8B6347", margin: "md" },
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        backgroundColor: "#FDF6EE",
        contents: [
          {
            type: "button",
            style: "primary",
            color: "#6F4E37",
            action: { type: "postback", label: "✅ 已上課 — 選擇進度", data: `action=select_progress&id=${opts.attendanceId}` },
          },
          {
            type: "button",
            style: "secondary",
            action: { type: "postback", label: "⚪ 停課", data: `action=report&id=${opts.attendanceId}&status=cancelled` },
          },
        ],
      },
    },
  };
}

// Preset progress options card
export function buildProgressSelectMessage(attendanceId: number) {
  const presets = ["依進度上課", "特別活動", "期末複習", "成果展示", "戶外活動", "體能測驗"];
  return {
    type: "flex",
    altText: "請選擇今日課程進度",
    contents: {
      type: "bubble",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#C8956C",
        paddingAll: "14px",
        contents: [{ type: "text", text: "📋 今日課程進度", color: "#FDF6EE", weight: "bold" }],
      },
      body: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#FDF6EE",
        spacing: "sm",
        paddingAll: "14px",
        contents: [
          ...presets.map((p) => ({
            type: "button",
            style: "secondary" as const,
            color: "#E8D5C0",
            action: { type: "postback", label: p, data: `action=report_progress&id=${attendanceId}&content=${encodeURIComponent(p)}` },
          })),
          {
            type: "button",
            style: "primary" as const,
            color: "#8B5E3C",
            action: { type: "postback", label: "✏️ 自訂輸入", data: `action=report_detail&id=${attendanceId}` },
          },
        ],
      },
    },
  };
}

// Format report for school notification (cream/coffee theme)
export function buildSchoolReportMessage(opts: {
  teacherName: string;
  school: string;
  courseType: string;
  date: string;
  studentCount: number | null;
  content: string;
  cancelled: boolean;
}) {
  return {
    type: "flex",
    altText: `本週課程完成報告：${opts.school} ${opts.courseType}`,
    contents: {
      type: "bubble",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#6F4E37",
        paddingAll: "16px",
        contents: [{ type: "text", text: "🌟 本週課程完成報告", color: "#FDF6EE", weight: "bold", size: "md" }],
      },
      body: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#FDF6EE",
        spacing: "md",
        paddingAll: "16px",
        contents: [
          { type: "text", text: opts.school, weight: "bold", color: "#4A2C17", size: "xl" },
          { type: "text", text: `課程：${opts.courseType}`, size: "sm", color: "#8B6347" },
          { type: "separator", color: "#E8D5C0", margin: "sm" },
          { type: "text", text: `教練：${opts.teacherName}`, size: "sm", color: "#4A2C17", margin: "sm" },
          ...(opts.studentCount != null ? [{
            type: "box", layout: "horizontal", margin: "sm",
            contents: [
              { type: "text", text: "✅ 完成進度：", size: "sm", color: "#6F4E37", flex: 0 },
              { type: "text", text: opts.content || "正常上課", size: "sm", color: "#4A2C17", weight: "bold", wrap: true },
            ],
          }] : []),
          ...(opts.content && !opts.studentCount ? [{
            type: "box", layout: "vertical", margin: "sm",
            backgroundColor: "#F0E0CC", cornerRadius: "8px", paddingAll: "10px",
            contents: [
              { type: "text", text: "📌 主題：", size: "xs", color: "#8B6347" },
              { type: "text", text: opts.content, size: "sm", color: "#4A2C17", wrap: true, margin: "xs" },
            ],
          }] : []),
          ...(opts.studentCount != null ? [{
            type: "box", layout: "horizontal", margin: "sm",
            backgroundColor: "#F0E0CC", cornerRadius: "8px", paddingAll: "10px",
            contents: [
              { type: "text", text: "👦 出席人數", size: "sm", color: "#8B6347", flex: 1 },
              { type: "text", text: `${opts.studentCount} 人`, size: "md", color: "#4A2C17", weight: "bold", align: "end" },
            ],
          }] : []),
          {
            type: "box", layout: "vertical", margin: "sm",
            backgroundColor: "#F0E0CC", cornerRadius: "8px", paddingAll: "10px",
            contents: [
              { type: "text", text: "💡 學習重點：", size: "xs", color: "#8B6347" },
              { type: "text", text: "教練依據現場狀況與孩童需求，進行專屬客製化教學。", size: "xs", color: "#8B6347", wrap: true, margin: "xs" },
            ],
          },
        ],
      },
    },
  };
}

// Student count board (幼兒園報數盤)
export function buildStudentCountBoard(department: string, min = 5, max = 30) {
  const nums = Array.from({ length: max - min + 1 }, (_, i) => i + min);
  const rows: object[] = [];
  for (let i = 0; i < nums.length; i += 4) {
    const chunk = nums.slice(i, i + 4);
    rows.push({
      type: "box", layout: "horizontal", spacing: "sm",
      contents: chunk.map((n) => ({
        type: "button", style: "secondary", height: "sm",
        action: { type: "message", label: String(n), text: `${department} ${n}` },
      })),
    });
  }
  return {
    type: "flex",
    altText: `🔵 ${department}報數盤`,
    contents: {
      type: "bubble",
      header: {
        type: "box", layout: "vertical", backgroundColor: "#92400E",
        contents: [{ type: "text", text: `🔵 ${department}報數盤`, color: "#ffffff", weight: "bold" }],
      },
      body: { type: "box", layout: "vertical", spacing: "sm", contents: rows },
    },
  };
}

export function generateBindCode(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}
