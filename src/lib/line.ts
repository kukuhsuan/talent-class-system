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

// Build post-class report request
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
        backgroundColor: "#059669",
        contents: [{ type: "text", text: "課程回報", color: "#ffffff", weight: "bold", size: "lg" }],
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        contents: [
          { type: "text", text: `${opts.school}`, weight: "bold" },
          { type: "text", text: `課程：${opts.courseType}`, size: "sm", color: "#555555" },
          { type: "text", text: "請選擇課程狀況：", size: "sm", margin: "md" },
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        contents: [
          {
            type: "button",
            style: "primary",
            color: "#059669",
            action: { type: "postback", label: "正常上課", data: `action=report&id=${opts.attendanceId}&status=normal` },
          },
          {
            type: "button",
            style: "secondary",
            action: { type: "postback", label: "填寫詳細回報", data: `action=report_detail&id=${opts.attendanceId}` },
          },
          {
            type: "button",
            style: "secondary",
            color: "#EF4444",
            action: { type: "postback", label: "停課", data: `action=report&id=${opts.attendanceId}&status=cancelled` },
          },
        ],
      },
    },
  };
}

// Format report for school notification
export function buildSchoolReportMessage(opts: {
  teacherName: string;
  school: string;
  courseType: string;
  date: string;
  studentCount: number | null;
  content: string;
  cancelled: boolean;
}) {
  const status = opts.cancelled ? "⚠️ 停課" : "✅ 正常上課";
  return {
    type: "flex",
    altText: `課程回報：${opts.school} ${opts.courseType}`,
    contents: {
      type: "bubble",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: opts.cancelled ? "#EF4444" : "#059669",
        contents: [{ type: "text", text: `課程回報 ${status}`, color: "#ffffff", weight: "bold" }],
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        contents: [
          { type: "text", text: opts.date, size: "sm", color: "#888888" },
          { type: "text", text: opts.school, weight: "bold" },
          { type: "text", text: `課程：${opts.courseType}`, size: "sm" },
          { type: "text", text: `老師：${opts.teacherName}`, size: "sm" },
          ...(opts.studentCount != null ? [{ type: "text", text: `出席人數：${opts.studentCount} 人`, size: "sm" }] : []),
          ...(opts.content ? [{ type: "text", text: `內容：${opts.content}`, size: "sm", wrap: true }] : []),
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
