import crypto from "crypto";
import { COURSE_LABEL, courseLabel } from "@/lib/courseMeta";
import { equipmentFirstClassText, equipmentTransferText, type EquipmentReminderData } from "@/lib/equipmentReminderCore";
import { signPublicAccessToken } from "@/lib/publicAccessToken";

export { COURSE_LABEL, courseLabel };

function appUrl() {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  return "https://talent-class-system.vercel.app";
}

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
export function buildCurriculumSelectMessage(
  attendanceId: number,
  courseType: string,
  customCurriculum?: Array<{ lesson: number; title: string }>,
): object {
  const label = courseLabel(courseType);
  const curriculum = customCurriculum?.length ? customCurriculum : (COURSE_CURRICULUM[label] ?? COURSE_CURRICULUM[courseType] ?? []);

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

export type LineRegion = "north" | "south" | "school" | "school2";

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
    school2: {
      secret: process.env.LINE_SCHOOL2_SECRET ?? "",
      token: process.env.LINE_SCHOOL2_TOKEN ?? "",
    },
  };
  return configs[region];
}

export function isSchoolLineRegion(region: LineRegion) {
  return region === "school" || region === "school2";
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
  title?: string;
  school?: string;
  courseType?: string;
  time?: string;
  date?: string;
  dayOfWeek?: string;
  courses?: Array<{
    attendanceId?: number;
    school: string;
    time: string;
    courseType?: string;
    address?: string;
    date?: string;
    dayOfWeek?: string;
    reportUrl?: string;
    confirmationSummary?: string;
    equipment?: EquipmentReminderData | null;
    studentCount?: number | null;
    studentCountA?: number | null;
    studentCountB?: number | null;
    expectedStudentCount?: number | null;
  }>;
}) {
  const courses = opts.courses?.length ? opts.courses : [{
    school: opts.school ?? "園所待確認", time: opts.time ?? "待確認",
    courseType: opts.courseType, date: opts.date, dayOfWeek: opts.dayOfWeek,
  }];
  // 人數顯示：優先顯示行政先填的預計人數；否則一般課顯示總數，安親班顯示 A/B 班
  const studentCountText = (course: (typeof courses)[number]) => {
    if (course.expectedStudentCount != null) return `預計 ${course.expectedStudentCount} 人`;
    if (course.studentCountA != null || course.studentCountB != null) {
      const parts: string[] = [];
      if (course.studentCountA != null) parts.push(`A班 ${course.studentCountA} 人`);
      if (course.studentCountB != null) parts.push(`B班 ${course.studentCountB} 人`);
      return parts.join("、");
    }
    return course.studentCount != null ? `${course.studentCount} 人` : "";
  };
  const bubbles = courses.slice(0, 12).map((course) => ({
    type: "bubble",
    header: {
      type: "box", layout: "vertical", backgroundColor: "#6B8FAB", paddingAll: "16px",
      contents: [{ type: "text", text: opts.title || "課程提醒", color: "#FFFFFF", weight: "bold", size: "xl" }],
    },
    body: {
      type: "box", layout: "vertical", spacing: "md", paddingAll: "16px", backgroundColor: "#FFFFFF",
      contents: [
        {
          type: "box", layout: "vertical", spacing: "xs", backgroundColor: "#F5F9FC", cornerRadius: "10px", paddingAll: "13px",
          contents: [
            { type: "text", text: "課程資訊", size: "sm", weight: "bold", color: "#47718F" },
            { type: "text", text: `老師｜${opts.teacherName}`, size: "sm", weight: "bold", color: "#333333", wrap: true, margin: "sm" },
            { type: "text", text: `日期｜${course.date || opts.date || "今天"}${course.dayOfWeek || opts.dayOfWeek ? `（${course.dayOfWeek || opts.dayOfWeek}）` : ""}`, size: "sm", color: "#555555", wrap: true },
            { type: "text", text: `時間｜${course.time || "待確認"}`, size: "sm", color: "#555555", wrap: true },
            { type: "text", text: `地點｜${course.school}`, size: "sm", color: "#555555", wrap: true },
            ...(course.address ? [{ type: "text" as const, text: `地址｜${course.address}`, size: "sm" as const, color: "#555555", wrap: true }] : []),
            { type: "text", text: `課程｜${courseLabel(course.courseType || opts.courseType || "")}`, size: "sm", color: "#555555", wrap: true },
            ...(studentCountText(course) ? [{ type: "text" as const, text: `人數｜${studentCountText(course)}`, size: "sm" as const, color: "#555555", wrap: true }] : []),
            ...(course.confirmationSummary ? [{ type: "text" as const, text: course.confirmationSummary, size: "xs" as const, color: "#5F6F83", wrap: true, margin: "sm" as const }] : []),
          ],
        },
        {
          type: "box", layout: "vertical", spacing: "xs", backgroundColor: "#F3F8F4", cornerRadius: "10px", paddingAll: "13px",
          contents: [
            { type: "text", text: "課後必做", size: "sm", weight: "bold", color: "#4F7A5F" },
            { type: "text", text: "✓ 回傳紙本點名表\n✓ 完成課程回報", size: "sm", color: "#3F5145", wrap: true, margin: "sm" },
          ],
        },
        // 📦 器材提醒：第一堂 / 需組裝
        ...(course.equipment && (course.equipment.isFirstClass || course.equipment.needsAssembly) ? [{
          type: "box" as const, layout: "vertical" as const, spacing: "xs" as const, backgroundColor: "#EEF2FB", cornerRadius: "10px", paddingAll: "13px",
          contents: [
            { type: "text" as const, text: "📦 器材提醒", size: "sm" as const, weight: "bold" as const, color: "#4C5FA3" },
            { type: "text" as const, text: equipmentFirstClassText(course.equipment), size: "sm" as const, color: "#3D4B7A", wrap: true, margin: "sm" as const },
          ],
        }] : []),
        // 📦 課後器材轉送提醒
        ...(course.equipment?.needsTransferAfterClass ? [{
          type: "box" as const, layout: "vertical" as const, spacing: "xs" as const, backgroundColor: "#FDF0EC", cornerRadius: "10px", paddingAll: "13px",
          contents: [
            { type: "text" as const, text: "📦 課後器材轉送提醒", size: "sm" as const, weight: "bold" as const, color: "#B25B3C" },
            { type: "text" as const, text: equipmentTransferText(course.equipment), size: "sm" as const, color: "#8C4A33", wrap: true, margin: "sm" as const },
          ],
        }] : []),
        {
          type: "box", layout: "vertical", backgroundColor: "#FFF8E8", cornerRadius: "10px", paddingAll: "13px",
          contents: [
            { type: "text", text: "薪資提醒", size: "sm", weight: "bold", color: "#A16207" },
            { type: "text", text: "⚠️ 請完成課程回報，否則該堂課暫不列入薪資計算。", size: "xs", color: "#92400E", wrap: true, margin: "sm" },
          ],
        },
      ],
    },
    ...(course.attendanceId || course.reportUrl ? {
      footer: {
        type: "box", layout: "vertical", paddingAll: "14px", backgroundColor: "#F5F9FC",
        spacing: "sm",
        contents: [
          {
            type: "button", style: "primary", color: "#2C82B8", height: "sm",
            action: { type: "uri", label: "課後回報", uri: course.reportUrl || `${appUrl()}/report/${encodeURIComponent(signPublicAccessToken("report", course.attendanceId!))}` },
          },
          ...(course.attendanceId ? [{
            type: "button" as const, style: "secondary" as const, height: "sm" as const,
            action: { type: "uri" as const, label: "更新人數", uri: `${appUrl()}/report/${encodeURIComponent(signPublicAccessToken("report", course.attendanceId))}` },
          }] : []),
          // 器材確認按鈕（postback）
          ...(course.attendanceId && course.equipment && (course.equipment.isFirstClass || course.equipment.needsAssembly) ? [{
            type: "button" as const, style: "secondary" as const, height: "sm" as const,
            action: { type: "postback" as const, label: course.equipment.needsAssembly ? "📦 已完成組裝" : "📦 已確認器材", data: `action=${course.equipment.needsAssembly ? "equipment_assembled" : "equipment_confirm"}&id=${course.attendanceId}` },
          }] : []),
          ...(course.attendanceId && course.equipment?.needsTransferAfterClass ? [{
            type: "button" as const, style: "secondary" as const, height: "sm" as const,
            action: { type: "postback" as const, label: "📦 已完成轉送", data: `action=equipment_transferred&id=${course.attendanceId}` },
          }] : []),
          ...(course.attendanceId && course.equipment && (course.equipment.isFirstClass || course.equipment.needsAssembly || course.equipment.needsTransferAfterClass) ? [{
            type: "button" as const, style: "secondary" as const, height: "sm" as const,
            action: { type: "postback" as const, label: "無法協助器材事項", data: `action=equipment_cannot_help&id=${course.attendanceId}` },
          }] : []),
        ],
      },
    } : {}),
  }));
  return {
    type: "flex",
    altText: `${opts.teacherName} 老師${opts.title || "課程提醒"}`,
    contents: bubbles.length === 1 ? bubbles[0] : { type: "carousel", contents: bubbles },
  };
}

// Build post-class report request (mobile form entry point)
export function buildReportRequestMessage(opts: {
  school: string;
  courseType: string;
  attendanceId: number;
}) {
  const label = courseLabel(opts.courseType);
  const reportToken = signPublicAccessToken("report", opts.attendanceId);
  // 風格與 buildReminderMessage（今日課程提醒）一致：藍灰標題、資訊區塊、藍色按鈕
  return {
    type: "flex",
    altText: `請回報 ${opts.school} ${label} 課程`,
    contents: {
      type: "bubble",
      header: {
        type: "box", layout: "vertical", backgroundColor: "#6B8FAB", paddingAll: "16px",
        contents: [{ type: "text", text: "課程回報", color: "#FFFFFF", weight: "bold", size: "xl" }],
      },
      body: {
        type: "box", layout: "vertical", spacing: "md", paddingAll: "16px", backgroundColor: "#FFFFFF",
        contents: [
          {
            type: "box", layout: "vertical", spacing: "xs", backgroundColor: "#F5F9FC", cornerRadius: "10px", paddingAll: "13px",
            contents: [
              { type: "text", text: "課程資訊", size: "sm", weight: "bold", color: "#47718F" },
              { type: "text", text: `地點｜${opts.school}`, size: "sm", color: "#555555", wrap: true, margin: "sm" },
              { type: "text", text: `課程｜${label}`, size: "sm", color: "#555555", wrap: true },
            ],
          },
          {
            type: "box", layout: "vertical", spacing: "xs", backgroundColor: "#F3F8F4", cornerRadius: "10px", paddingAll: "13px",
            contents: [
              { type: "text", text: "課後必做", size: "sm", weight: "bold", color: "#4F7A5F" },
              { type: "text", text: "✓ 回傳紙本點名表\n✓ 完成課程回報", size: "sm", color: "#3F5145", wrap: true, margin: "sm" },
            ],
          },
          {
            type: "box", layout: "vertical", backgroundColor: "#FFF8E8", cornerRadius: "10px", paddingAll: "13px",
            contents: [
              { type: "text", text: "薪資提醒", size: "sm", weight: "bold", color: "#A16207" },
              { type: "text", text: "⚠️ 請完成課程回報，否則該堂課暫不列入薪資計算。", size: "xs", color: "#92400E", wrap: true, margin: "sm" },
            ],
          },
        ],
      },
      footer: {
        type: "box", layout: "vertical", paddingAll: "14px", backgroundColor: "#F5F9FC", spacing: "sm",
        contents: [
          {
            type: "button", style: "primary", color: "#2C82B8", height: "sm",
            action: { type: "uri", label: "課後回報", uri: `${appUrl()}/report/${encodeURIComponent(reportToken)}` },
          },
          {
            type: "button", style: "secondary", height: "sm",
            action: { type: "uri", label: "更新人數", uri: `${appUrl()}/report/${encodeURIComponent(reportToken)}` },
          },
        ],
      },
    },
  };
}

export function buildLeaveCourseSelectMessage(opts: {
  teacherName: string;
  semesterLeaveCount: number;
  courses: Array<{ attendanceId: number; date: string; time: string; school: string; courseType: string; role?: string }>;
}) {
  const courseCards = opts.courses.slice(0, 10).flatMap((course, index) => [
    ...(index === 0 ? [] : [{ type: "separator", color: "#E8EEF0", margin: "md" }]),
    {
      type: "box",
      layout: "vertical",
      spacing: "xs",
      paddingTop: index === 0 ? "0px" : "12px",
      paddingBottom: "6px",
      contents: [
        {
          type: "box",
          layout: "horizontal",
          contents: [
            { type: "text", text: course.date, size: "sm", color: "#244B52", weight: "bold", flex: 4 },
            { type: "text", text: course.time || "時間未填", size: "sm", color: "#527C86", align: "end" as const, flex: 5, wrap: true },
          ],
        },
        { type: "text", text: `${course.school}｜${courseLabel(course.courseType)}`, size: "sm", color: "#263B40", weight: "bold", wrap: true, margin: "xs" },
        { type: "text", text: `身份｜${course.role || "主教"}`, size: "xs", color: "#7B8B90", wrap: true },
        {
          type: "button",
          style: "secondary" as const,
          height: "sm" as const,
          color: "#EAF4F2",
          margin: "sm",
          action: {
            type: "postback",
            label: "選這堂",
            data: `action=leave_select&id=${course.attendanceId}`,
            displayText: `我要請假：${course.date} ${course.time} ${course.school} ${courseLabel(course.courseType)}`,
          },
        },
      ],
    },
  ]);

  return {
    type: "flex",
    altText: `${opts.teacherName} 老師請選擇請假課程`,
    contents: {
      type: "bubble",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#DDEDEA",
        paddingAll: "16px",
        contents: [
          { type: "text", text: "申請請假", color: "#244B52", weight: "bold", size: "xl" },
          { type: "text", text: `${opts.teacherName} 老師`, color: "#5F7F85", size: "sm", margin: "xs" },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#FBFCFA",
        paddingAll: "16px",
        spacing: "md",
        contents: [
          {
            type: "text",
            text: `提醒：您本學期已請假 ${opts.semesterLeaveCount} 次，本次送出後將累計為 ${opts.semesterLeaveCount + 1} 次。`,
            size: "sm",
            color: "#52656A",
            wrap: true,
          },
          { type: "separator", color: "#E8EEF0" },
          { type: "text", text: "請選擇要請假的課程：", size: "sm", color: "#244B52", weight: "bold" },
          ...courseCards,
        ],
      },
    },
  };
}

export function buildLeaveCancelSelectMessage(opts: {
  teacherName: string;
  leaves: Array<{ id: number; date: string; time: string; school: string; courseType: string; role?: string; status: string }>;
}) {
  const leaveCards = opts.leaves.slice(0, 10).flatMap((leave, index) => [
    ...(index === 0 ? [] : [{ type: "separator", color: "#E8EEF0", margin: "md" }]),
    {
      type: "box",
      layout: "vertical",
      spacing: "xs",
      paddingTop: index === 0 ? "0px" : "12px",
      paddingBottom: "6px",
      contents: [
        {
          type: "box",
          layout: "horizontal",
          contents: [
            { type: "text", text: leave.date, size: "sm", color: "#244B52", weight: "bold", flex: 4 },
            { type: "text", text: leave.time || "時間未填", size: "sm", color: "#527C86", align: "end" as const, flex: 5, wrap: true },
          ],
        },
        { type: "text", text: `${leave.school}｜${courseLabel(leave.courseType)}`, size: "sm", color: "#263B40", weight: "bold", wrap: true, margin: "xs" },
        { type: "text", text: `身份｜${leave.role || "主教"}　狀態｜${leave.status}`, size: "xs", color: "#7B8B90", wrap: true },
        {
          type: "button",
          style: "secondary" as const,
          height: "sm" as const,
          color: "#FDECEC",
          margin: "sm",
          action: {
            type: "postback",
            label: "取消這筆請假",
            data: `action=leave_cancel&id=${leave.id}`,
            displayText: `取消請假：${leave.date} ${leave.time} ${leave.school}`,
          },
        },
      ],
    },
  ]);

  return {
    type: "flex",
    altText: `${opts.teacherName} 老師取消請假`,
    contents: {
      type: "bubble",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#FDECEC",
        paddingAll: "16px",
        contents: [
          { type: "text", text: "取消請假", color: "#8A2D2D", weight: "bold", size: "xl" },
          { type: "text", text: `${opts.teacherName} 老師`, color: "#9A5A5A", size: "sm", margin: "xs" },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#FBFCFA",
        paddingAll: "16px",
        spacing: "md",
        contents: [
          { type: "text", text: "請選擇要取消的請假申請：", size: "sm", color: "#8A2D2D", weight: "bold" },
          { type: "text", text: "已找到代課老師的申請，需聯絡行政重新處理。", size: "xs", color: "#A16207", wrap: true },
          ...leaveCards,
        ],
      },
    },
  };
}

export function buildSubstituteInquiryMessage(opts: {
  inquiryId: number;
  date: string;
  time: string;
  school: string;
  courseType: string;
  address?: string;
}) {
  return {
    type: "flex",
    altText: `代課詢問 ${opts.date} ${opts.school}`,
    contents: {
      type: "bubble",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#DDEDEA",
        paddingAll: "16px",
        contents: [
          { type: "text", text: "代課詢問", color: "#244B52", weight: "bold", size: "xl" },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#FBFCFA",
        paddingAll: "16px",
        spacing: "sm",
        contents: [
          { type: "text", text: "老師您好，請問您是否可以協助以下課程代課？", size: "sm", color: "#52656A", wrap: true },
          { type: "separator", margin: "md", color: "#E8EEF0" },
          { type: "text", text: `日期｜${opts.date}`, size: "sm", color: "#263B40", wrap: true },
          { type: "text", text: `時間｜${opts.time}`, size: "sm", color: "#263B40", wrap: true },
          { type: "text", text: `園所｜${opts.school}`, size: "sm", color: "#263B40", wrap: true },
          { type: "text", text: `課程｜${courseLabel(opts.courseType)}`, size: "sm", color: "#263B40", wrap: true },
          ...(opts.address ? [{ type: "text", text: `地點｜${opts.address}`, size: "sm", color: "#52656A", wrap: true }] : []),
          { type: "text", text: "回覆後需由行政最後確認，才會正式安排代課。", size: "xs", color: "#7B8B90", wrap: true, margin: "md" },
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#FBFCFA",
        spacing: "sm",
        contents: [
          { type: "button", style: "primary", color: "#5E9C7B", action: { type: "postback", label: "可以代課", data: `action=sub_available&inquiryId=${opts.inquiryId}`, displayText: "可以代課" } },
          { type: "button", style: "secondary", color: "#EEF2F3", action: { type: "postback", label: "無法代課", data: `action=sub_unavailable&inquiryId=${opts.inquiryId}`, displayText: "無法代課" } },
          { type: "button", style: "secondary", color: "#FDECEC", action: { type: "postback", label: "取消代課", data: `action=sub_cancel&inquiryId=${opts.inquiryId}`, displayText: "取消代課" } },
        ],
      },
    },
  };
}

export function buildSubstituteConfirmedMessage(opts: {
  inquiryId: number;
  date: string;
  time: string;
  school: string;
  courseType: string;
}) {
  return {
    type: "flex",
    altText: `已確認代課 ${opts.date} ${opts.school}`,
    contents: {
      type: "bubble",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#DDEDEA",
        paddingAll: "16px",
        contents: [
          { type: "text", text: "已確認代課", color: "#244B52", weight: "bold", size: "xl" },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#FBFCFA",
        paddingAll: "16px",
        spacing: "sm",
        contents: [
          { type: "text", text: "行政已確認由您協助以下課程代課：", size: "sm", color: "#52656A", wrap: true },
          { type: "separator", margin: "md", color: "#E8EEF0" },
          { type: "text", text: `日期｜${opts.date}`, size: "sm", color: "#263B40", wrap: true },
          { type: "text", text: `時間｜${opts.time}`, size: "sm", color: "#263B40", wrap: true },
          { type: "text", text: `園所｜${opts.school}`, size: "sm", color: "#263B40", wrap: true },
          { type: "text", text: `課程｜${courseLabel(opts.courseType)}`, size: "sm", color: "#263B40", wrap: true },
          { type: "text", text: "若臨時無法代課，請點下方取消代課，行政會重新確認安排。", size: "xs", color: "#A16207", wrap: true, margin: "md" },
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#FBFCFA",
        contents: [{
          type: "button",
          style: "secondary",
          color: "#FDECEC",
          action: { type: "postback", label: "取消代課", data: `action=sub_cancel&inquiryId=${opts.inquiryId}`, displayText: "取消代課" },
        }],
      },
    },
  };
}

// Build a text-only report reminder (used by home page "提醒老師回報" and notify page)
export function buildReportReminderMessage(opts: {
  teacherName: string;
  school: string;
  courseName: string;
  date: string; // YYYY-MM-DD
  time: string;
}) {
  const [year, month, day] = opts.date.split("-").map(Number);
  const dateFormatted = `${year}年${month}月${day}日`;
  const timeStr = opts.time?.trim() || "待確認";

  const text = [
    "📌 課程回報提醒",
    "",
    `親愛的 ${opts.teacherName} 教練您好：`,
    "",
    "提醒您以下課程尚未完成回報：",
    "",
    `🏫 ${opts.school}`,
    `📚 ${opts.courseName}`,
    `📅 ${dateFormatted}`,
    `⏰ ${timeStr}`,
    "",
    "請於 48 小時內完成課程回報。",
    "",
    "課程回報內容包含：",
    "1️⃣ 出席人數（課內課免填）",
    "2️⃣ 課程進度 / 今日課程內容",
    "3️⃣ 備註或特殊狀況",
    "",
    "⚠️ 課程回報是薪資核算與園所服務紀錄的重要依據。",
    "若未完成回報，該堂課將暫不列入薪資結算，待資料補齊後再行核算。",
    "",
    "感謝老師配合！",
  ].join("\n");

  return { type: "text", text };
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
  courses: Array<{ school: string; courseType: string; dayOfWeek: string; time: string; dateLabel?: string; address?: string; confirmationSummary?: string }>;
}) {
  const rows = opts.courses.flatMap((c, index) => [
    ...(index === 0 ? [] : [{ type: "separator", margin: "md", color: "#E8EEF0" }]),
    {
    type: "box",
    layout: "vertical",
    paddingTop: index === 0 ? "0px" : "12px",
    paddingBottom: "12px",
    spacing: "xs",
    contents: [
      {
        type: "box",
        layout: "horizontal",
        spacing: "md",
        contents: [
          { type: "text", text: `${c.dateLabel ? `${c.dateLabel} ` : ""}${c.dayOfWeek.replace("星期", "週")}`, size: "xs", color: "#4F6F73", flex: 3, weight: "bold" },
          { type: "text", text: c.time || "時間未填", size: "xs", color: "#527C86", flex: 4, align: "end" as const, wrap: true },
        ],
      },
      { type: "text", text: `${courseLabel(c.courseType)}｜${c.school}`, size: "sm", color: "#263B40", weight: "bold", wrap: true, margin: "sm" },
      ...(c.address ? [{ type: "text", text: c.address, size: "xs", color: "#7B8B90", wrap: true, margin: "xs" }] : []),
      ...(c.confirmationSummary ? [{ type: "text", text: c.confirmationSummary, size: "xxs", color: "#5F7F85", wrap: true, margin: "xs" }] : []),
    ],
    },
  ]);

  return {
    type: "flex",
    altText: `${opts.teacherName} 老師 ${opts.weekLabel} 課程表`,
    contents: {
      type: "bubble",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#DDEDEA",
        paddingAll: "16px",
        contents: [
          { type: "text", text: "本週課程表", color: "#244B52", weight: "bold", size: "xl" },
          { type: "text", text: `${opts.teacherName} 老師　${opts.weekLabel}`, color: "#5F7F85", size: "sm", margin: "xs" },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#FBFCFA",
        paddingAll: "16px",
        spacing: "none",
        contents: [
          ...rows,
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#FBFCFA",
        paddingTop: "0px",
        paddingBottom: "14px",
        paddingStart: "16px",
        paddingEnd: "16px",
        contents: [{
          type: "text",
          text: "祝教學順利，謝謝您",
          size: "xs",
          color: "#8AA1A6",
          align: "center" as const,
        }],
      },
    },
  };
}

// Build a schedule carousel. LINE allows up to 12 bubbles, so the yearly view uses one bubble per month.
export function buildTwoMonthScheduleMessage(opts: {
  teacherName: string;
  weeks: Array<{
    label: string;       // e.g. "5/12（一）~ 5/16（五）"
    month: string;       // e.g. "5月"
    entries: Array<{ date: string; dayShort: string; school: string; courseType: string; time: string; address?: string; confirmationSummary?: string }>;
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
            ...(e.confirmationSummary ? [{ type: "text", text: e.confirmationSummary, size: "xxs", color: "#6B6358", wrap: true }] : []),
          ],
        }))
        : [{ type: "text", text: "本週無課", size: "sm", color: "#9A9088", align: "center" as const }],
    },
  }));

  return {
    type: "flex",
    altText: `${opts.teacherName} 老師課程表`,
    contents: { type: "carousel", contents: bubbles.slice(0, 12) },
  };
}

export function generateBindCode(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}
