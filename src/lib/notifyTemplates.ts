import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { courseLabel } from "@/lib/courseMeta";
import { getOrCreatePortalCode } from "@/lib/schoolPortalAccess";

// 客服批次通知：範本定義與逐一收件人訊息組裝
// 變數：{姓名}{園所}{課程}{日期}{星期}{時間}{地址}{課程摘要}{園所連結}{開課確認連結}{停課狀態}

export type NotifyTargetType = "teacher" | "school";
export type NotifyTemplateKey =
  | "new_term"
  | "class_notes"
  | "coach_rules"
  | "typhoon"
  | "school_term"
  | "school_links";

export const TYPHOON_STATUS_OPTIONS = ["停課", "照常上課", "等待園所確認"] as const;

export type NotifyTemplateDef = {
  key: NotifyTemplateKey;
  label: string;
  target: NotifyTargetType;
  editable: boolean;          // 是否允許客服修改內文
  needsTyphoonStatus?: boolean;
  needsAck?: boolean;         // 每位收件人附專屬「確認收到」連結
  description: string;
  defaultBody: string;
};

const PUNCTUAL_LINES = "⏰ 請準時到校，勿遲到早退\n🙂 請保持禮貌與專業態度";

export const NOTIFY_TEMPLATES: NotifyTemplateDef[] = [
  {
    key: "new_term",
    label: "新學期課程通知",
    target: "teacher",
    editable: true,
    description: "自動帶入老師本學期每堂課的園所、課程、開始日期、星期、時間、地址與主教/助教身分",
    defaultBody: [
      "📚 新學期課程通知",
      "",
      "{姓名} 老師您好：",
      "",
      "新學期課程安排如下：",
      "",
      "{課程摘要}",
      "",
      "若資訊有誤或需調整，請與行政聯繫，謝謝！",
    ].join("\n"),
  },
  {
    key: "class_notes",
    label: "上課注意事項",
    target: "teacher",
    editable: true,
    description: "內文可自行編輯，支援 {姓名} 等變數",
    defaultBody: [
      "📌 上課注意事項",
      "",
      "{姓名} 老師您好：",
      "",
      "1️⃣ 請提前 10 分鐘到校準備",
      "2️⃣ 上課請穿著制服並保持專業形象",
      "3️⃣ 課後請完成課程回報並回傳點名表",
      "",
      PUNCTUAL_LINES,
      "",
      "如有問題請聯繫行政，謝謝配合！",
    ].join("\n"),
  },
  {
    key: "coach_rules",
    label: "教練工作提醒事項",
    target: "teacher",
    editable: true,
    needsAck: true,
    description: "教練工作規範，以卡片訊息發送並附「確認收到」按鈕，教練點選後於發送紀錄顯示已確認",
    defaultBody: [
      "📋 教練工作提醒事項",
      "",
      "{姓名} 教練您好，為維持課程品質及專業形象，請務必遵守以下規範：",
      "",
      "1️⃣ 準時上下班",
      "・請勿遲到、早退",
      "・請於上課前完成場地及器材準備",
      "",
      "2️⃣ 課程結束時間",
      "・課程時間到再開始收拾器材，不得提早整理影響學生上課權益",
      "・確認所有學生下課後，再完成器材清點與歸位",
      "",
      "3️⃣ 班級秩序管理（班控）",
      "・維持課堂秩序，建立清楚的上課規範",
      "・發現學生狀況時，立即適當處理並與帶班老師配合",
      "",
      "4️⃣ 課程總結",
      "・每堂課結束前，請用 1–2 分鐘回顧本堂課 1～2 個重點",
      "・鼓勵學生回家自主練習，讓學習更有延續性",
      "",
      "5️⃣ 肢體接觸原則",
      "・請勿主動觸碰學生身體",
      "・如因教學、安全或緊急狀況確有必要，須先告知現場老師，並在老師知情下協助處理",
      "",
      "6️⃣ 器材管理",
      "・上課前確認器材數量及安全性",
      "・上、下課協助搬運、整理及歸位器材，保持場地整潔",
      "",
      "7️⃣ 專業形象",
      "・穿著整齊、配戴教練識別證（如有）",
      "・上課期間避免使用手機處理私人事務",
      "",
      "8️⃣ 教學態度",
      "・多鼓勵、少責備，以正向引導學生",
      "・注意每位學生的參與狀況，避免學生長時間等待",
      "",
      "9️⃣ 安全第一",
      "・隨時留意學生安全及周遭環境",
      "・若學生受傷、生病或發生突發事件，立即通知帶班老師及公司主管",
      "",
      "🔟 團隊合作",
      "・尊重帶班老師及其他教練，主動互相支援",
      "・如遇問題或需要協助，請立即向主管反映，不要自行判斷處理",
      "",
      "以上事項請所有教練共同遵守，透過一致的教學品質、專業態度及安全管理，提供學生最佳的學習體驗，也建立公司良好的品牌形象。",
      "",
      "✅ 請點選下方「確認收到」按鈕，確認您已收到並詳閱本提醒事項。",
    ].join("\n"),
  },
  {
    key: "typhoon",
    label: "颱風／停課緊急通知",
    target: "teacher",
    editable: true,
    needsTyphoonStatus: true,
    description: "發送前必須先選擇課程狀態（停課／照常上課／等待園所確認），不預設停課",
    defaultBody: [
      "🌀 颱風／停課緊急通知",
      "",
      "{姓名} 您好：",
      "",
      "因應天候狀況，{日期} 課程狀態：",
      "👉 {停課狀態}",
      "",
      "如有異動將另行通知，請留意訊息，謝謝。",
    ].join("\n"),
  },
  {
    key: "school_term",
    label: "園所開課通知",
    target: "school",
    editable: true,
    description: "自動帶入該園所本學期課程摘要",
    defaultBody: [
      "📚 開課通知",
      "",
      "{園所} 您好：",
      "",
      "本學期課程安排如下：",
      "",
      "{課程摘要}",
      "",
      "若有問題請與客服聯繫，謝謝！",
    ].join("\n"),
  },
  {
    key: "school_links",
    label: "開課連結懶人包",
    target: "school",
    editable: true,
    description: "自動帶入園所專屬看板連結、開課資料確認連結與課程摘要（安親班不附開課資料確認連結）",
    defaultBody: [
      "🔗 開課資訊懶人包",
      "",
      "{園所} 您好：",
      "",
      "本學期課程：",
      "{課程摘要}",
      "",
      "📱 園所專屬看板（成果／回報／評分）：",
      "{園所連結}",
      "",
      "📝 開課資料確認連結（請協助填寫）：",
      "{開課確認連結}",
      "",
      "有任何問題歡迎聯繫客服，謝謝！",
    ].join("\n"),
  },
];

export function getTemplate(key: string) {
  return NOTIFY_TEMPLATES.find((t) => t.key === key) ?? null;
}

function appUrl() {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  return "https://talent-class-system.vercel.app";
}

// 台北時區日期（YYYY-MM-DD）
function taipeiDateStr(offsetDays = 0) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei" }).format(new Date(Date.now() + offsetDays * 86400000));
}

function formatDateLabel(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return `${y}/${m}/${d}`;
}

function weekdayLabel(iso: string) {
  const day = new Date(`${iso}T00:00:00+08:00`).getDay();
  return ["日", "一", "二", "三", "四", "五", "六"][day];
}

export function renderTemplate(body: string, vars: Record<string, string>) {
  return body.replace(/\{(姓名|園所|課程|日期|星期|時間|地址|課程摘要|園所連結|開課確認連結|停課狀態|確認連結)\}/g, (_, key: string) => vars[key] ?? "");
}

// 摺疊多餘空行並修整前後空白（變數為空時避免留下大段空白）
function stripEmptySections(text: string) {
  return text.replace(/\n{3,}/g, "\n\n").trim();
}

export type BatchRecipientMessage = {
  id: number;
  name: string;
  lineUserId: string | null;
  lineRegion: string; // north/south/school/school2
  message: string;
  skipped?: string; // 略過原因（如當日無課）
  ackToken?: string; // 「確認收到」專屬 token（needsAck 範本）
  ackUrl?: string;   // 確認頁網址 → 發送時改用 Flex 卡片附按鈕
};

type BuildOptions = {
  templateKey: NotifyTemplateKey;
  targetType: NotifyTargetType;
  recipientIds: number[];
  customBody?: string;
  typhoonStatus?: string;
};

const MAX_MESSAGE_LENGTH = 4500; // LINE text 上限 5000，保留緩衝

function finalizeMessage(body: string, vars: Record<string, string>) {
  const rendered = stripEmptySections(renderTemplate(body, vars));
  return rendered.slice(0, MAX_MESSAGE_LENGTH);
}

async function schoolLineRegions(ids: number[]): Promise<Map<number, string>> {
  const map = new Map<number, string>();
  if (ids.length === 0) return map;
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{ id: number | bigint; lineRegion: string | null }>>(
      `SELECT id, lineRegion FROM School WHERE id IN (${ids.map(() => "?").join(",")})`,
      ...ids,
    );
    for (const row of rows) map.set(Number(row.id), row.lineRegion === "school2" ? "school2" : "school");
  } catch {
    for (const id of ids) map.set(id, "school");
  }
  return map;
}

// 依範本與收件人組出每人實際訊息（預覽與發送共用，確保所見即所得）
export async function buildBatchMessages(opts: BuildOptions): Promise<BatchRecipientMessage[]> {
  const template = getTemplate(opts.templateKey);
  if (!template) throw new Error("範本不存在");
  if (template.target !== opts.targetType) throw new Error("範本與收件對象類型不符");
  const body = (template.editable && opts.customBody?.trim()) ? opts.customBody.trim() : template.defaultBody;
  if (template.needsTyphoonStatus) {
    if (!TYPHOON_STATUS_OPTIONS.includes((opts.typhoonStatus ?? "") as (typeof TYPHOON_STATUS_OPTIONS)[number])) {
      throw new Error("請先選擇課程狀態（停課／照常上課／等待園所確認）");
    }
  }
  const ids = [...new Set(opts.recipientIds.map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  if (ids.length === 0) throw new Error("請先選擇收件人");

  if (opts.targetType === "teacher") {
    const teachers = await prisma.teacher.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, lineUserId: true, lineRegion: true },
    });
    const byId = new Map(teachers.map((t) => [t.id, t]));

    // 課程摘要素材
    let summaryByTeacher = new Map<number, string>();
    const dateIso = taipeiDateStr(0);
    if (opts.templateKey === "new_term") {
      const courses = await prisma.course.findMany({
        where: { isActive: true, OR: [{ teacherId: { in: ids } }, { assistantTeacherId: { in: ids } }] },
        select: {
          teacherId: true, assistantTeacherId: true, school: true, courseType: true,
          dayOfWeek: true, weekday: true, time: true, address: true, startDate: true,
        },
        orderBy: [{ school: "asc" }],
      });
      const acc = new Map<number, string[]>();
      for (const c of courses) {
        const day = (c.dayOfWeek || c.weekday || "").replace("星期", "週") || "週次未填";
        const start = c.startDate ? `${c.startDate.getMonth() + 1}/${c.startDate.getDate()} 起，` : "";
        const line = (roleLabel: string) => [
          `🏫 ${c.school}`,
          `📚 ${courseLabel(c.courseType)}（${roleLabel}）`,
          `📅 ${start}每${day} ${c.time || "時間未填"}`,
          ...(c.address ? [`📍 ${c.address}`] : []),
        ].join("\n");
        if (ids.includes(c.teacherId)) (acc.get(c.teacherId) ?? acc.set(c.teacherId, []).get(c.teacherId)!).push(line("主教"));
        if (c.assistantTeacherId && ids.includes(c.assistantTeacherId)) {
          (acc.get(c.assistantTeacherId) ?? acc.set(c.assistantTeacherId, []).get(c.assistantTeacherId)!).push(line("助教"));
        }
      }
      summaryByTeacher = new Map([...acc].map(([k, v]) => [k, v.join("\n\n")]));
    }

    return ids.map((id) => {
      const t = byId.get(id);
      if (!t) return { id, name: `#${id}`, lineUserId: null, lineRegion: "north", message: "", skipped: "找不到老師資料" };
      const summary = summaryByTeacher.get(id) ?? "";
      if (opts.templateKey === "new_term" && !summary) {
        return { id, name: t.name, lineUserId: t.lineUserId, lineRegion: t.lineRegion || "north", message: "", skipped: "無進行中課程" };
      }
      const vars: Record<string, string> = {
        姓名: t.name,
        日期: `${formatDateLabel(dateIso)}（週${weekdayLabel(dateIso)}）`,
        星期: `週${weekdayLabel(dateIso)}`,
        課程摘要: summary,
        停課狀態: opts.typhoonStatus ?? "",
      };
      // needsAck：每人專屬「確認收到」連結 → 發送時以 Flex 卡片附按鈕
      const ackToken = template.needsAck ? crypto.randomBytes(16).toString("hex") : undefined;
      const ackUrl = ackToken ? `${appUrl()}/notify-ack/${ackToken}` : undefined;
      if (ackUrl) vars.確認連結 = ackUrl;
      return { id, name: t.name, lineUserId: t.lineUserId, lineRegion: t.lineRegion || "north", message: finalizeMessage(body, vars), ackToken, ackUrl };
    });
  }

  // 園所
  const schools = await prisma.school.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, lineUserId: true },
  });
  const byId = new Map(schools.map((s) => [s.id, s]));
  const regionMap = await schoolLineRegions(ids);
  const courses = await prisma.course.findMany({
    where: { isActive: true, schoolId: { in: ids } },
    select: { schoolId: true, courseType: true, dayOfWeek: true, weekday: true, time: true, department: true, teacher: { select: { name: true } } },
    orderBy: [{ courseType: "asc" }],
  });
  const summaryBySchool = new Map<number, string[]>();
  const afterSchoolSet = new Set<number>();
  for (const c of courses) {
    if (c.schoolId == null) continue;
    if ((c.department ?? "").includes("安親")) afterSchoolSet.add(c.schoolId);
    const day = (c.dayOfWeek || c.weekday || "").replace("星期", "週") || "週次未填";
    const line = `📚 ${courseLabel(c.courseType)}｜每${day} ${c.time || "時間未填"}｜${c.teacher?.name ?? ""}老師`;
    (summaryBySchool.get(c.schoolId) ?? summaryBySchool.set(c.schoolId, []).get(c.schoolId)!).push(line);
  }

  const results: BatchRecipientMessage[] = [];
  for (const id of ids) {
    const s = byId.get(id);
    if (!s) {
      results.push({ id, name: `#${id}`, lineUserId: null, lineRegion: "school", message: "", skipped: "找不到園所資料" });
      continue;
    }
    const summary = (summaryBySchool.get(id) ?? []).join("\n");
    if (!summary) {
      results.push({ id, name: s.name, lineUserId: s.lineUserId, lineRegion: regionMap.get(id) ?? "school", message: "", skipped: "無進行中課程" });
      continue;
    }
    let portalLink = "";
    let confirmLink = "";
    if (opts.templateKey === "school_links") {
      const code = await getOrCreatePortalCode(id);
      portalLink = `${appUrl()}/school-portal/${encodeURIComponent(code)}`;
      // 安親班不附開課資料確認連結
      confirmLink = afterSchoolSet.has(id) ? "" : `${portalLink}?confirmation=1`;
    }
    let effectiveBody = body;
    if (opts.templateKey === "school_links" && !confirmLink) {
      // 移除開課確認區塊（標題行＋變數行）
      effectiveBody = body.split("\n").filter((line) => !line.includes("開課資料確認") && !line.includes("{開課確認連結}")).join("\n");
    }
    const vars: Record<string, string> = {
      姓名: s.name,
      園所: s.name,
      日期: formatDateLabel(taipeiDateStr(0)),
      課程摘要: summary,
      園所連結: portalLink,
      開課確認連結: confirmLink,
      停課狀態: opts.typhoonStatus ?? "",
    };
    results.push({ id, name: s.name, lineUserId: s.lineUserId, lineRegion: regionMap.get(id) ?? "school", message: finalizeMessage(effectiveBody, vars) });
  }
  return results;
}
