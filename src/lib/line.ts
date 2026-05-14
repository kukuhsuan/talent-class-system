import crypto from "crypto";
import { COURSE_LABEL, courseLabel } from "@/lib/courseMeta";

export { COURSE_LABEL, courseLabel };

// Course curriculum data (lesson number → title)
export const COURSE_CURRICULUM: Record<string, Array<{ lesson: number; title: string }>> = {
  足球: [
    { lesson: 1, title: "點球、炒蛋" },
    { lesson: 2, title: "點球、炒蛋（流暢度）" },
    { lesson: 3, title: "移動式點球、炒蛋" },
    { lesson: 4, title: "移動式點球（進階）" },
    { lesson: 5, title: "後拉球" },
    { lesson: 6, title: "側拉球" },
    { lesson: 7, title: "側拉球、後拉球" },
    { lesson: 8, title: "S 型盤球" },
    { lesson: 9, title: "S 型盤球（進階）" },
    { lesson: 10, title: "W 型盤球" },
    { lesson: 11, title: "W 型盤球（穩定）" },
    { lesson: 12, title: "運球" },
    { lesson: 13, title: "運球（抬頭看路）" },
    { lesson: 14, title: "盤運球" },
    { lesson: 15, title: "停球" },
    { lesson: 16, title: "停球（紅綠燈）" },
    { lesson: 17, title: "移動中停球" },
    { lesson: 18, title: "彈地球" },
    { lesson: 19, title: "2 碼射門" },
    { lesson: 20, title: "2 碼射門＋障礙物" },
    { lesson: 21, title: "1v1 搶球＋射門" },
    { lesson: 22, title: "3 碼射門" },
    { lesson: 23, title: "2人傳球射門" },
    { lesson: 24, title: "2v2 搶球＋射門" },
  ],
  高爾夫: [
    { lesson: 1, title: "高爾夫禮儀" },
    { lesson: 2, title: "基本概念" },
    { lesson: 3, title: "基本動作" },
    { lesson: 4, title: "高爾夫短推桿" },
    { lesson: 5, title: "基礎短切推桿" },
    { lesson: 6, title: "專注力切推桿" },
    { lesson: 7, title: "力量控制" },
    { lesson: 8, title: "穩定切推桿" },
    { lesson: 9, title: "節律切推桿" },
    { lesson: 10, title: "判斷力切推桿" },
    { lesson: 11, title: "想像力切推桿" },
    { lesson: 12, title: "切滾球練習" },
    { lesson: 13, title: "規則概念" },
    { lesson: 14, title: "基本動作小競賽" },
    { lesson: 15, title: "切桿（二階）" },
    { lesson: 16, title: "高拋球（避障）" },
    { lesson: 17, title: "切桿進階 9L3Y" },
    { lesson: 18, title: "切桿進階（穩定）" },
    { lesson: 19, title: "切桿短距離競賽" },
    { lesson: 20, title: "切桿中短距離競賽" },
  ],
  冰壺: [
    { lesson: 1, title: "發壺練習" },
    { lesson: 2, title: "發壺技巧調整" },
    { lesson: 3, title: "技術實練＆分組比賽" },
    { lesson: 4, title: "3碼距離推壺" },
    { lesson: 5, title: "冰壺過山洞" },
    { lesson: 6, title: "技術實練＆障礙練習" },
    { lesson: 7, title: "冰壺大風吹" },
    { lesson: 8, title: "技術實練＆目標瞄準" },
    { lesson: 9, title: "5碼距離推壺" },
    { lesson: 10, title: "技術實練＆障礙練習２" },
    { lesson: 11, title: "技術實練＆目標瞄準２" },
    { lesson: 12, title: "紳士遊戲" },
    { lesson: 13, title: "技術實練" },
    { lesson: 14, title: "紳士競賽" },
    { lesson: 15, title: "距離力道控制技巧" },
    { lesson: 16, title: "技術實練（總複習）" },
    { lesson: 17, title: "我是瞄準王" },
  ],
  棒球: [
    { lesson: 1, title: "樂樂棒球禮儀、規則" },
    { lesson: 2, title: "基本概念" },
    { lesson: 3, title: "投球基本動作" },
    { lesson: 4, title: "短距離傳接球" },
    { lesson: 5, title: "中長距離投球" },
    { lesson: 6, title: "專注力壘間傳球" },
    { lesson: 7, title: "內野守備練習" },
    { lesson: 8, title: "內野守備節律" },
    { lesson: 9, title: "守備判斷力" },
    { lesson: 10, title: "高飛球與滾地球" },
    { lesson: 11, title: "綜合守備練習" },
    { lesson: 12, title: "打擊、短打練習" },
    { lesson: 13, title: "推打、拉打教學" },
    { lesson: 14, title: "守備、跑壘教學" },
    { lesson: 15, title: "裁判員與教練模擬" },
    { lesson: 16, title: "投球守備打擊跑壘測驗" },
    { lesson: 17, title: "模擬比賽教學" },
    { lesson: 18, title: "全壘打大賽" },
    { lesson: 19, title: "投準大賽" },
    { lesson: 20, title: "分組對抗賽" },
  ],
  舞蹈: [
    { lesson: 1, title: "課程介紹、認識時間空間力量" },
    { lesson: 2, title: "身體部位的運用" },
    { lesson: 3, title: "動作的運用（上肢）" },
    { lesson: 4, title: "動作的運用（空間移位）" },
    { lesson: 5, title: "時間：快慢節奏" },
    { lesson: 6, title: "空間：大小高低方向" },
    { lesson: 7, title: "力量：強弱輕重" },
    { lesson: 8, title: "主題：魔鏡最像的人" },
    { lesson: 9, title: "主題：我的一天" },
    { lesson: 10, title: "主題：會跳舞的衛生紙" },
    { lesson: 11, title: "主題：我的身體會說話" },
    { lesson: 12, title: "主題：跟動物做朋友" },
    { lesson: 13, title: "主題：身體停止器" },
    { lesson: 14, title: "基礎芭蕾（一）" },
    { lesson: 15, title: "基礎芭蕾＋灌籃高手" },
    { lesson: 16, title: "基礎芭蕾（二）" },
    { lesson: 17, title: "基礎芭蕾（三）青蛙生長記" },
    { lesson: 18, title: "基礎芭蕾（四）呼拉圈" },
    { lesson: 19, title: "彩排三首舞碼" },
    { lesson: 20, title: "期末呈現" },
  ],
  體能: [
    { lesson: 1, title: "聽聲辨位（圓盤）" },
    { lesson: 2, title: "華麗的舞步（標盤）" },
    { lesson: 3, title: "動物旅行（欄架）" },
    { lesson: 4, title: "穿越時光隧道" },
    { lesson: 5, title: "步步高升（繩梯）" },
    { lesson: 6, title: "來去自如（三角錐）" },
    { lesson: 7, title: "萬里長城（哨子）" },
    { lesson: 8, title: "麥可喬登（球）" },
    { lesson: 9, title: "動物園（標盤）" },
    { lesson: 10, title: "官兵抓強盜" },
    { lesson: 11, title: "巨猩喬揚（繩梯）" },
    { lesson: 12, title: "穿越時光隧道（進階）" },
    { lesson: 13, title: "動物旅行（進階）" },
    { lesson: 14, title: "小小守門員（足球）" },
    { lesson: 15, title: "聽聲辨位（進階）" },
    { lesson: 16, title: "彈簧腿（高低欄架）" },
    { lesson: 17, title: "官兵抓強盜（進階）" },
    { lesson: 18, title: "萬里長城（進階）" },
    { lesson: 19, title: "華麗的舞步（進階）" },
    { lesson: 20, title: "步步高升（速度）" },
  ],
  籃球: [
    { lesson: 1, title: "原地球感" },
    { lesson: 2, title: "左右手運球" },
    { lesson: 3, title: "左右手交換運球" },
    { lesson: 4, title: "左右手帶球運球" },
    { lesson: 5, title: "雙手投籃" },
    { lesson: 6, title: "單手投籃" },
    { lesson: 7, title: "定點接球投籃" },
    { lesson: 8, title: "傳接球投籃" },
    { lesson: 9, title: "帶球跑動式" },
    { lesson: 10, title: "帶球跨步" },
    { lesson: 11, title: "運球上籃" },
    { lesson: 12, title: "連續運球上籃" },
    { lesson: 13, title: "帶球定點式" },
    { lesson: 14, title: "下肢折返式訓練" },
    { lesson: 15, title: "左右手投籃" },
    { lesson: 16, title: "左右手帶球投籃" },
    { lesson: 17, title: "基本團隊訓練規則" },
    { lesson: 18, title: "模擬比賽" },
    { lesson: 19, title: "競賽訓練" },
    { lesson: 20, title: "團隊訓練" },
  ],
};

// Build curriculum selection carousel for a course type
export function buildCurriculumSelectMessage(attendanceId: number, courseType: string): object {
  const label = courseLabel(courseType);
  const curriculum = COURSE_CURRICULUM[label] ?? COURSE_CURRICULUM[courseType] ?? [];

  // Fallback to generic presets if no curriculum
  if (curriculum.length === 0) {
    return buildProgressSelectMessage(attendanceId);
  }

  const PAGE_SIZE = 9;
  const pages: Array<typeof curriculum> = [];
  for (let i = 0; i < curriculum.length; i += PAGE_SIZE) {
    pages.push(curriculum.slice(i, i + PAGE_SIZE));
  }

  const bubbles = pages.map((page) => {
    const startLesson = page[0].lesson;
    const endLesson = page[page.length - 1].lesson;
    return {
      type: "bubble",
      size: "kilo",
      header: {
        type: "box", layout: "vertical", backgroundColor: "#7B9E87", paddingAll: "12px",
        contents: [
          { type: "text", text: `📋 ${label}課程進度`, color: "#F6F3EE", weight: "bold", size: "sm" },
          { type: "text", text: `第 ${startLesson}～${endLesson} 堂`, color: "#DDD8D0", size: "xs", margin: "xs" },
        ],
      },
      body: {
        type: "box", layout: "vertical", backgroundColor: "#F6F3EE", spacing: "xs", paddingAll: "10px",
        contents: page.map((c) => ({
          type: "button",
          style: "secondary" as const,
          color: "#DDD8D0",
          height: "sm" as const,
          action: {
            type: "postback",
            label: `第${c.lesson}堂 ${c.title}`.slice(0, 20),
            data: `action=report_progress&id=${attendanceId}&content=${encodeURIComponent(`第${c.lesson}堂 ${c.title}`)}&lesson=${c.lesson}`,
          },
        })),
      },
      footer: {
        type: "box", layout: "vertical", backgroundColor: "#F6F3EE", paddingAll: "8px",
        contents: [{
          type: "button", style: "primary" as const, color: "#5C8A78", height: "sm" as const,
          action: { type: "postback", label: "✏️ 自訂輸入", data: `action=report_detail&id=${attendanceId}` },
        }],
      },
    };
  });

  return {
    type: "flex",
    altText: `${label} 請選擇今日課程進度`,
    contents: { type: "carousel", contents: bubbles },
  };
}

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
  const label = courseLabel(opts.courseType);
  return {
    type: "flex",
    altText: `明日課程提醒：${opts.school} ${label}`,
    contents: {
      type: "bubble",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#6B8FAB",
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
          { type: "text", text: `課程：${label}`, size: "sm", color: "#555555" },
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

// Build post-class report request (cream/coffee theme, no cancel option)
export function buildReportRequestMessage(opts: {
  school: string;
  courseType: string;
  attendanceId: number;
}) {
  const label = courseLabel(opts.courseType);
  return {
    type: "flex",
    altText: `請回報 ${opts.school} ${label} 課程`,
    contents: {
      type: "bubble",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#7B9E87",
        paddingAll: "16px",
        contents: [
          { type: "text", text: "📝 課程回報", color: "#F6F3EE", weight: "bold", size: "lg" },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#F6F3EE",
        spacing: "sm",
        paddingAll: "16px",
        contents: [
          { type: "text", text: opts.school, weight: "bold", color: "#2E2B27", size: "lg" },
          { type: "text", text: `課程：${label}`, size: "sm", color: "#6B6358" },
          { type: "separator", margin: "md", color: "#DDD8D0" },
          { type: "text", text: "請選擇今日課程進度：", size: "sm", color: "#6B6358", margin: "md" },
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        backgroundColor: "#F6F3EE",
        contents: [
          {
            type: "button",
            style: "primary",
            color: "#7B9E87",
            action: { type: "postback", label: "📋 選擇課程進度", data: `action=select_progress&id=${opts.attendanceId}` },
          },
          {
            type: "button",
            style: "primary",
            color: "#8BA4B2",
            action: { type: "postback", label: "✏️ 自訂輸入", data: `action=report_detail&id=${opts.attendanceId}` },
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
        backgroundColor: "#8BA4B2",
        paddingAll: "14px",
        contents: [{ type: "text", text: "📋 今日課程進度", color: "#F6F3EE", weight: "bold" }],
      },
      body: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#F6F3EE",
        spacing: "sm",
        paddingAll: "14px",
        contents: [
          ...presets.map((p) => ({
            type: "button",
            style: "secondary" as const,
            color: "#DDD8D0",
            action: { type: "postback", label: p, data: `action=report_progress&id=${attendanceId}&content=${encodeURIComponent(p)}` },
          })),
          {
            type: "button",
            style: "primary" as const,
            color: "#5C8A78",
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
  const label = courseLabel(opts.courseType);
  return {
    type: "flex",
    altText: `本週課程完成報告：${opts.school} ${label}`,
    contents: {
      type: "bubble",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#7B9E87",
        paddingAll: "16px",
        contents: [{ type: "text", text: "🌟 本週課程完成報告", color: "#F6F3EE", weight: "bold", size: "md" }],
      },
      body: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#F6F3EE",
        spacing: "md",
        paddingAll: "16px",
        contents: [
          { type: "text", text: opts.school, weight: "bold", color: "#2E2B27", size: "xl" },
          { type: "text", text: `課程：${label}`, size: "sm", color: "#6B6358" },
          { type: "separator", color: "#DDD8D0", margin: "sm" },
          { type: "text", text: `教練：${opts.teacherName}`, size: "sm", color: "#2E2B27", margin: "sm" },
          ...(opts.studentCount != null ? [{
            type: "box", layout: "horizontal", margin: "sm",
            contents: [
              { type: "text", text: "✅ 完成進度：", size: "sm", color: "#7B9E87", flex: 0 },
              { type: "text", text: opts.content || "正常上課", size: "sm", color: "#2E2B27", weight: "bold", wrap: true },
            ],
          }] : []),
          ...(opts.content && !opts.studentCount ? [{
            type: "box", layout: "vertical", margin: "sm",
            backgroundColor: "#EAE4DC", cornerRadius: "8px", paddingAll: "10px",
            contents: [
              { type: "text", text: "📌 主題：", size: "xs", color: "#6B6358" },
              { type: "text", text: opts.content, size: "sm", color: "#2E2B27", wrap: true, margin: "xs" },
            ],
          }] : []),
          ...(opts.studentCount != null ? [{
            type: "box", layout: "horizontal", margin: "sm",
            backgroundColor: "#EAE4DC", cornerRadius: "8px", paddingAll: "10px",
            contents: [
              { type: "text", text: "👦 出席人數", size: "sm", color: "#6B6358", flex: 1 },
              { type: "text", text: `${opts.studentCount} 人`, size: "md", color: "#2E2B27", weight: "bold", align: "end" },
            ],
          }] : []),
          {
            type: "box", layout: "vertical", margin: "sm",
            backgroundColor: "#EAE4DC", cornerRadius: "8px", paddingAll: "10px",
            contents: [
              { type: "text", text: "💡 學習重點：", size: "xs", color: "#6B6358" },
              { type: "text", text: "教練依據現場狀況與孩童需求，進行專屬客製化教學。", size: "xs", color: "#6B6358", wrap: true, margin: "xs" },
            ],
          },
        ],
      },
    },
  };
}

// Student count board — uses postback so group info is carried
// group: "" = single class (幼兒園/國小), "A" = 安親A班, "B" = 安親B班
export function buildStudentCountBoard(
  attendanceId: number,
  group: "" | "A" | "B",
  department: string,
  min = 1,
  max = 40,
) {
  const isAnqin = group !== "";
  const headerLabel = isAnqin ? `👥 ${department} ${group}班 人數` : `👥 ${department} 出席人數`;
  const headerColor = isAnqin && group === "B" ? "#8BA4B2" : "#7B9E87";
  const maxCount = isAnqin ? 40 : 25; // 安親 max 40, 幼兒園 max 25
  const actualMax = Math.min(max, maxCount);

  const nums = Array.from({ length: actualMax - min + 1 }, (_, i) => i + min);
  const rows: object[] = [];
  for (let i = 0; i < nums.length; i += 5) {
    const chunk = nums.slice(i, i + 5);
    rows.push({
      type: "box", layout: "horizontal", spacing: "xs",
      contents: chunk.map((n) => ({
        type: "button", style: "secondary", height: "sm", color: "#EAE4DC",
        action: {
          type: "postback",
          label: String(n),
          data: `action=report_count&id=${attendanceId}&group=${group}&count=${n}`,
        },
      })),
    });
  }

  return {
    type: "flex",
    altText: headerLabel,
    contents: {
      type: "bubble",
      header: {
        type: "box", layout: "vertical", backgroundColor: headerColor, paddingAll: "12px",
        contents: [{ type: "text", text: headerLabel, color: "#ffffff", weight: "bold", size: "sm" }],
      },
      body: {
        type: "box", layout: "vertical", spacing: "sm", paddingAll: "12px",
        backgroundColor: "#F6F3EE",
        contents: rows,
      },
    },
  };
}

// Build weekly schedule message for teacher
export function buildScheduleMessage(opts: {
  teacherName: string;
  weekLabel: string; // e.g. "5/13 ~ 5/17"
  courses: Array<{ school: string; courseType: string; dayOfWeek: string; time: string; dateLabel?: string; address?: string }>;
}) {
  const rows = opts.courses.map((c) => ({
    type: "box",
    layout: "vertical",
    paddingTop: "8px",
    paddingBottom: "8px",
    spacing: "xs",
    contents: [
      {
        type: "box",
        layout: "horizontal",
        contents: [
          { type: "text", text: `${c.dateLabel ? `${c.dateLabel} ` : ""}${c.dayOfWeek.replace("星期", "週")}`, size: "xs", color: "#6B6358", flex: 3, weight: "bold" },
          { type: "text", text: c.time || "時間未填", size: "xs", color: "#8B8176", flex: 3, align: "end" as const, wrap: true },
        ],
      },
      { type: "text", text: `${courseLabel(c.courseType)}｜${c.school}`, size: "sm", color: "#2E2B27", weight: "bold", wrap: true },
      ...(c.address ? [{ type: "text", text: c.address, size: "xs", color: "#8B8176", wrap: true }] : []),
    ],
  }));

  return {
    type: "flex",
    altText: `${opts.teacherName} 老師 ${opts.weekLabel} 課程表`,
    contents: {
      type: "bubble",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#7B9E87",
        paddingAll: "16px",
        contents: [
          { type: "text", text: "📅 本週課程表", color: "#F6F3EE", weight: "bold", size: "lg" },
          { type: "text", text: `${opts.teacherName} 老師　${opts.weekLabel}`, color: "#DDD8D0", size: "sm", margin: "xs" },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#F6F3EE",
        paddingAll: "14px",
        spacing: "none",
        contents: [
          ...rows,
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#F6F3EE",
        contents: [{
          type: "text",
          text: "祝教學順利，謝謝您！☕",
          size: "xs",
          color: "#8BA4B2",
          align: "center" as const,
        }],
      },
    },
  };
}

// Build a 2-month schedule as a carousel (one bubble per week, ~8 weeks)
export function buildTwoMonthScheduleMessage(opts: {
  teacherName: string;
  weeks: Array<{
    label: string;       // e.g. "5/12（一）~ 5/16（五）"
    month: string;       // e.g. "5月"
    entries: Array<{ date: string; dayShort: string; school: string; courseType: string; time: string; address?: string }>;
  }>;
}): object {
  const bubbles = opts.weeks.map((week) => ({
    type: "bubble",
    size: "kilo",
    header: {
      type: "box", layout: "horizontal", backgroundColor: "#7B9E87", paddingAll: "10px",
      contents: [
        { type: "text", text: week.month, color: "#DDD8D0", size: "xs", flex: 0 },
        { type: "text", text: week.label, color: "#F6F3EE", size: "sm", weight: "bold", flex: 1, margin: "sm" },
      ],
    },
    body: {
      type: "box", layout: "vertical", backgroundColor: "#F6F3EE", paddingAll: "10px", spacing: "xs",
      contents: week.entries.length > 0
        ? week.entries.map((e) => ({
          type: "box", layout: "vertical", paddingTop: "7px", paddingBottom: "7px", spacing: "xs",
          contents: [
            {
              type: "box", layout: "horizontal",
              contents: [
                { type: "text", text: `${e.date}（${e.dayShort}）`, size: "xs", color: "#6B6358", weight: "bold", flex: 3 },
                { type: "text", text: e.time || "時間未填", size: "xs", color: "#9A9088", flex: 3, align: "end" as const, wrap: true },
              ],
            },
            { type: "text", text: `${courseLabel(e.courseType)}｜${e.school}`, size: "xs", color: "#2E2B27", weight: "bold", wrap: true },
            ...(e.address ? [{ type: "text", text: e.address, size: "xxs", color: "#9A9088", wrap: true }] : []),
          ],
        }))
        : [{ type: "text", text: "本週無課", size: "sm", color: "#9A9088", align: "center" as const }],
    },
  }));

  return {
    type: "flex",
    altText: `${opts.teacherName} 老師近2個月課程表`,
    contents: { type: "carousel", contents: bubbles },
  };
}

export function generateBindCode(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}
