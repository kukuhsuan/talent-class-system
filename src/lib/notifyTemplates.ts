import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { courseLabel } from "@/lib/courseMeta";
import { resolveCourseTerm } from "@/lib/courseTerm";
import { readLessonTemplatesBulk } from "@/lib/lessonTemplates";
import { getOrCreatePortalCode } from "@/lib/schoolPortalAccess";

// 客服批次通知：範本定義與逐一收件人訊息組裝
// 變數：{姓名}{園所}{課程}{日期}{星期}{時間}{地址}{課程摘要}{園所連結}{開課確認連結}{停課狀態}{會議簡報}

export type NotifyTargetType = "teacher" | "school";
export type NotifyTemplateKey =
  | "new_term"
  | "first_class"
  | "term_kickoff_meeting"
  | "class_notes"
  | "coach_rules"
  | "typhoon"
  | "school_term"
  | "school_links"
  | "demo_followup";

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
    needsAck: true,
    description: "自動帶入老師本學期每堂課的園所、課程、開始日期、星期、時間、地址與主教/助教身分，以卡片發送並附「確認收到」按鈕",
    defaultBody: [
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
    key: "first_class",
    label: "第一堂課課表通知",
    target: "teacher",
    editable: true,
    needsAck: true,
    description: "自動帶入老師第一堂課所需的園所、課程、主教／助教身分、第一堂課程進度、開課日期、時間、地點與報名人數，以卡片發送並附「確認收到」按鈕",
    defaultBody: [
      "{姓名} 老師您好：",
      "",
      "📘 第一堂課課表與班級資訊如下：",
      "",
      "{課程摘要}",
      "",
      "第一堂課請協助確認：",
      "1️⃣ 請提前 10 分鐘到校，完成場地與器材準備",
      "2️⃣ 依現場實際狀況核對上課人數",
      "3️⃣ 上課前確認活動範圍、器材與孩子安全",
      "4️⃣ 課後請依課程類別完成進度或人數回報",
      "",
      "⏰ 請準時到校，勿遲到早退",
      "🙂 請保持禮貌與專業態度",
      "",
      "若課表、人數或地點有誤，請立即與行政聯繫，謝謝！",
    ].join("\n"),
  },
  {
    key: "term_kickoff_meeting",
    label: "新學期開課會議通知",
    target: "teacher",
    editable: true,
    needsAck: true,
    description: "通知教練新學期開課會議的時間與會議重點。內文中的日期、時間與會議連結請於發送前改成當次資訊；網址會自動變成卡片上可點的按鈕，並附「確認收到」按鈕",
    defaultBody: [
      "{姓名} 教練您好：",
      "",
      "新學期即將開始，為讓大家對本學期的課程安排、教學重點與行政流程有一致的認識，將召開開課會議，敬請務必出席。",
      "",
      "📅 日期：8/12",
      "🕐 時間：12:20-13:10",
      "💻 形式：線上會議（Google Meet）",
      "線上會議連結：https://meet.google.com/rbo-waxx-nqv",
      "",
      "📋 會議重點",
      "1️⃣ 本學期課程安排與班級分配",
      "2️⃣ 教學進度與各課程重點說明",
      "3️⃣ 器材領取、場地與安全注意事項",
      "4️⃣ 課程回報、點名與請假流程",
      "5️⃣ Q&A 與問題交流",
      "",
      "🔔 出席提醒",
      "・請於會議開始前 5 分鐘進入線上會議室",
      "・入會後請將顯示名稱改為本名，方便點名",
      "・請準備紙筆，方便記錄各班注意事項",
      "・若確定無法出席，請提前告知行政，另行安排補說明",
      "",
      "✅ 請點選下方「確認收到」按鈕，回覆您已收到本次會議通知。",
    ].join("\n"),
  },
  {
    key: "class_notes",
    label: "上課注意事項",
    target: "teacher",
    editable: true,
    needsAck: true,
    description: "內文可自行編輯，支援 {姓名} 等變數，以卡片發送並附「確認收到」按鈕",
    defaultBody: [
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
    needsAck: true,
    description: "發送前必須先選擇課程狀態（停課／照常上課／等待園所確認），不預設停課；以卡片發送並附「確認收到」按鈕",
    defaultBody: [
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
    needsAck: true,
    description: "自動帶入該園所本學期課程摘要，以卡片發送並附「確認收到」按鈕",
    defaultBody: [
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
    label: "新學期開課通知",
    target: "school",
    editable: true,
    needsAck: false,
    description: "自動帶入課程摘要，卡片按鈕直接連到開課資料填寫（上課人數、場地）與園所專屬看板（安親班不附開課資料填寫）",
    defaultBody: [
      "{園所} 您好：",
      "",
      "新學期課程如下：",
      "{課程摘要}",
      "",
      "請協助填寫開課資料（上課人數、上課場地）：",
      "{開課確認連結}",
      "",
      "園所專屬看板（成果／回報／評分）：",
      "{園所連結}",
      "",
      "有任何問題歡迎聯繫客服，謝謝！",
    ].join("\n"),
  },
  {
    key: "demo_followup",
    label: "Demo 後報名狀況確認",
    target: "school",
    editable: true,
    needsAck: false,
    description: "體驗課程結束後，向園所確認後續報名狀況，方便安排老師與準備器材",
    defaultBody: [
      "{園所} 老師您好：",
      "",
      "上週的體驗課程已順利完成，想請問目前後續的報名狀況如何呢？",
      "",
      "為方便我們提前安排授課老師並準備課程所需器材，再麻煩您協助告知預計報名人數，謝謝！",
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
  return body.replace(/\{(姓名|園所|課程|日期|星期|時間|地址|課程摘要|園所連結|開課確認連結|停課狀態|確認連結|會議簡報)\}/g, (_, key: string) => vars[key] ?? "");
}

// {會議簡報}：批次層級的會議簡報連結（每批同一個）。在變數替換／按鈕抽取之前先換成實際網址，
// 之後就與內文寫死的會議連結走完全相同的路徑（自動抽成 Flex 卡片按鈕）。
// 未填連結時移除含此變數的整行，避免卡片留下「會議簡報：」空標籤。
export function applySlidesUrl(body: string, slidesUrl?: string) {
  if (!body.includes("{會議簡報}")) return body;
  const url = (slidesUrl ?? "").trim();
  if (!url) return body.split("\n").filter((line) => !line.includes("{會議簡報}")).join("\n");
  return body.split("{會議簡報}").join(url);
}

// 摺疊多餘空行並修整前後空白（變數為空時避免留下大段空白）
function stripEmptySections(text: string) {
  return text.replace(/\n{3,}/g, "\n\n").trim();
}

// 課程色塊（Flex 卡片內每堂課一塊，同課程同色）
export type FlexBlock = { title: string; lines: string[]; color: string; bg: string };
export type FlexLinkButton = { label: string; url: string; primary?: boolean };
// 整學期教學課表（第一堂課通知：直接在 LINE 以獨立卡片列出，不用另開連結）
export type LessonPlanItem = { lesson: number; title: string; focus: string; skills: string[]; activityDirection?: string };
// detail：一堂一張 bubble、含完整教案（教案推播用）
// summary：多堂併成一張 bubble、只留標題與重點（第一堂課通知用，避免塞爆老師的聊天室）
export type LessonPlanLayout = "detail" | "summary";
export type LessonPlanCard = { courseName: string; color: string; bg: string; items: LessonPlanItem[]; layout?: LessonPlanLayout };

export type BatchRecipientMessage = {
  id: number;
  name: string;
  lineUserId: string | null;
  lineRegion: string; // north/south/school/school2
  message: string;
  skipped?: string; // 略過原因（如當日無課）
  ackToken?: string; // 「確認收到」專屬 token（needsAck 範本）
  ackUrl?: string;   // 確認頁網址 → 發送時改用 Flex 卡片附按鈕
  flexPre?: string;  // 卡片：課程色塊上方文字
  flexPost?: string; // 卡片：課程色塊下方文字
  flexBlocks?: FlexBlock[];       // 卡片：課程色塊
  linkButtons?: FlexLinkButton[]; // 卡片：連結按鈕（新學期開課通知）
  lessonPlans?: LessonPlanCard[]; // 附加訊息：整學期教學課表（第一堂課通知）
};

// 依課程名稱固定配色（同課程每次同色）
const BLOCK_COLORS: Array<{ fg: string; bg: string }> = [
  { fg: "#2C5DA8", bg: "#EAF1FB" }, // 藍
  { fg: "#3E8E5A", bg: "#EAF6EE" }, // 綠
  { fg: "#B0722B", bg: "#FBF3E6" }, // 琥珀
  { fg: "#7D4CA0", bg: "#F4EDFA" }, // 紫
  { fg: "#C0564B", bg: "#FBEDEB" }, // 磚紅
  { fg: "#2A8C8C", bg: "#E9F6F6" }, // 藍綠
];
function blockColor(key: string) {
  let h = 0;
  for (const ch of key) h = (h * 31 + (ch.codePointAt(0) ?? 0)) >>> 0;
  return BLOCK_COLORS[h % BLOCK_COLORS.length];
}

const SUMMARY_MARK = "\u0000";
const LINK_MARK = "\u0001";

// 將內文拆成 色塊上段／下段；連結改為卡片按鈕時，一併移除連結行與其上的標題行
function buildFlexParts(body: string, vars: Record<string, string>, opts?: { stripLinks?: boolean }) {
  const flexVars: Record<string, string> = { ...vars, 課程摘要: SUMMARY_MARK };
  if (opts?.stripLinks) { flexVars.園所連結 = LINK_MARK; flexVars.開課確認連結 = LINK_MARK; }
  let rendered = renderTemplate(body, flexVars);
  if (opts?.stripLinks) {
    const kept: string[] = [];
    for (const line of rendered.split("\n")) {
      if (line.includes(LINK_MARK)) {
        while (kept.length && /[：:]\s*$/.test(kept[kept.length - 1].trim())) kept.pop();
        continue;
      }
      kept.push(line);
    }
    rendered = kept.join("\n");
  }
  rendered = stripEmptySections(rendered);
  const idx = rendered.indexOf(SUMMARY_MARK);
  if (idx < 0) return null; // 自訂內文移除了 {課程摘要} → 卡片以純文字呈現
  return {
    flexPre: stripEmptySections(rendered.slice(0, idx)),
    flexPost: stripEmptySections(rendered.slice(idx + 1)),
  };
}

// Flex 卡片內的文字網址不能點，所以把內文裡的連結抽出來改成卡片按鈕。
// 按鈕文字取網址前面那段說明（例如「線上會議連結：https://…」→ 按鈕「🔗 線上會議連結」），
// 整行從內文移除，避免卡片同時出現一段點不了的網址。
const INLINE_URL = /https?:\/\/[^\s，。、）)】」]+/;
const MAX_LINK_BUTTONS = 3;
const LINE_BUTTON_LABEL_MAX = 20; // LINE button label 上限

const MAX_LABEL_SOURCE = 14; // 說明文字太長就不拿來當按鈕文字
export function extractLinkButtons(body: string): { body: string; buttons: FlexLinkButton[] } {
  const buttons: FlexLinkButton[] = [];
  const kept: string[] = [];
  for (const line of body.split("\n")) {
    const match = line.match(INLINE_URL);
    if (!match || match.index === undefined || buttons.length >= MAX_LINK_BUTTONS) {
      kept.push(line);
      continue;
    }
    const url = match[0];
    const prefix = line.slice(0, match.index).replace(/[：:\-–—\s]+$/, "").replace(/^🔗\s*/, "").trim();
    const label = prefix && prefix.length <= MAX_LABEL_SOURCE ? prefix : "開啟連結";
    buttons.push({ label: `🔗 ${label}`.slice(0, LINE_BUTTON_LABEL_MAX), url, primary: buttons.length === 0 });
    // 說明文字已成為按鈕文字；網址後面若還有話要說就保留，否則整行移除
    const suffix = line.slice(match.index + url.length).replace(/^[。，、）)\s]+/, "").trim();
    if (suffix) kept.push(suffix);
    // 網址單獨成行時，上一行的引導句（結尾為冒號）也一併移除，避免卡片留下「請點：」
    else while (kept.length && /[：:]\s*$/.test(kept[kept.length - 1])) kept.pop();
  }
  return { body: kept.join("\n"), buttons };
}

type BuildOptions = {
  templateKey: NotifyTemplateKey;
  targetType: NotifyTargetType;
  recipientIds: number[];
  customBody?: string;
  typhoonStatus?: string;
  slidesUrl?: string;  // {會議簡報} 帶入的連結（發送前填寫，整批共用）
  // 客服在預覽頁挑選要通知的課程；未傳 = 沿用預設（第一堂課通知自動略過開課日已過的課）
  selectedCourseIds?: number[];
  // 每個課程類別要通知的堂數區間（第一堂課通知的教學課表卡片與「課程進度」行）
  lessonRangeByCourse?: Record<string, { from?: number; to?: number }>;
};

// 預覽頁「挑選要通知的課程」清單用
export type BatchCourseOption = {
  id: number;
  school: string;
  courseName: string;
  startDateIso: string;
  dayLabel: string;
  time: string;
  isPast: boolean;      // 開課日已過 → 預設不勾選
  teacherNames: string[];
};

function courseDayLabel(c: { dayOfWeek?: string | null; weekday?: string | null }) {
  return (c.dayOfWeek || c.weekday || "").replace("星期", "週") || "週次未填";
}

function isoOf(date: Date | null | undefined) {
  return date ? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei" }).format(date) : "";
}

// 預覽時列出這批老師名下所有 115-1 課程，讓客服自行勾選要通知哪幾堂
export async function listTeacherCourseOptions(recipientIds: number[]) {
  const today = taipeiDateStr(0);
  const courses = await prisma.course.findMany({
    where: {
      isActive: true,
      OR: [{ teacherId: { in: recipientIds } }, { assistantTeacherId: { in: recipientIds } }],
    },
    select: {
      id: true, school: true, courseType: true, dayOfWeek: true, weekday: true, time: true,
      startDate: true, notes: true,
      teacher: { select: { name: true } },
      assistantTeacher: { select: { name: true } },
    },
    orderBy: [{ startDate: "asc" }, { school: "asc" }],
  });
  const options: BatchCourseOption[] = [];
  for (const c of courses) {
    if (resolveCourseTerm(c) !== "115-1") continue;
    const startDateIso = isoOf(c.startDate);
    options.push({
      id: c.id,
      school: c.school,
      courseName: courseLabel(c.courseType) || "課程",
      startDateIso,
      dayLabel: courseDayLabel(c),
      time: c.time || "時間未填",
      isPast: Boolean(startDateIso) && startDateIso < today,
      teacherNames: [c.teacher?.name, c.assistantTeacher?.name].filter((n): n is string => Boolean(n)),
    });
  }
  const lessonTemplates = await readLessonTemplatesBulk(prisma, courses.map((c) => c.courseType));
  const lessonCounts: Record<string, number> = {};
  for (const [courseName, lessons] of lessonTemplates) lessonCounts[courseName] = lessons.length;
  return { courses: options, lessonCounts };
}

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
  const rawBody = (template.editable && opts.customBody?.trim()) ? opts.customBody.trim() : template.defaultBody;
  // 先把 {會議簡報} 換成實際網址（整批同一個），之後即與內文寫死的連結走相同路徑
  const body = applySlidesUrl(rawBody, opts.slidesUrl);
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

    // 課程摘要素材（文字版供紀錄／備援；色塊版供 Flex 卡片）
    const itemsByTeacher = new Map<number, Array<{ text: string; block: FlexBlock }>>();
    // 第一堂課通知：主卡片之後另外附整學期教學課表卡片（每位老師只列他實際帶的課程）
    const lessonPlanByCourse = new Map<string, LessonPlanCard>();
    const lessonPlanCoursesByTeacher = new Map<number, Set<string>>();
    const dateIso = taipeiDateStr(0);
    if (opts.templateKey === "new_term" || opts.templateKey === "first_class") {
      const courses = await prisma.course.findMany({
        where: { isActive: true, OR: [{ teacherId: { in: ids } }, { assistantTeacherId: { in: ids } }] },
        select: {
          id: true,
          teacherId: true, assistantTeacherId: true, school: true, courseType: true,
          dayOfWeek: true, weekday: true, time: true, address: true, startDate: true,
          enrollCount: true, notes: true,
        },
        orderBy: [{ school: "asc" }],
      });
      // 客服挑選的課程；未傳代表沿用預設
      const selectedCourseIds = opts.selectedCourseIds ? new Set(opts.selectedCourseIds) : null;
      const todayIso = taipeiDateStr(0);
      const isCourseIncluded = (c: { id: number; startDate: Date | null }) => {
        if (selectedCourseIds) return selectedCourseIds.has(c.id);
        // 預設：第一堂課通知不重複通知已經開課的班（開課日已過）
        if (opts.templateKey !== "first_class") return true;
        const startIso = isoOf(c.startDate);
        return !startIso || startIso >= todayIso;
      };
      // 每個課程類別要通知的堂數區間（預設整學期）
      const lessonRangeOf = (courseName: string, total: number) => {
        const raw = opts.lessonRangeByCourse?.[courseName];
        const from = Math.min(Math.max(Math.trunc(raw?.from ?? 1) || 1, 1), Math.max(total, 1));
        const to = Math.min(Math.max(Math.trunc(raw?.to ?? total) || total, from), Math.max(total, 1));
        return { from, to };
      };
      // 通知起始堂的標題（顯示在課程色塊的「課程進度」行）
      const noticeLessonByCourse = new Map<string, { lesson: number; title: string }>();
      if (opts.templateKey === "first_class") {
        const lessonTemplates = await readLessonTemplatesBulk(
          prisma,
          courses.map((course) => course.courseType),
        );
        // readLessonTemplatesBulk 回傳的 key 已是 courseLabel()，與下方 label 同一組鍵值
        for (const [courseName, lessons] of lessonTemplates) {
          const sorted = [...lessons].sort((a, b) => a.lesson - b.lesson);
          const { from, to } = lessonRangeOf(courseName, sorted.length);
          // 通知只給課表概覽，完整教案走 /lesson-plan 的教案推播
          const planItems: LessonPlanItem[] = sorted
            .filter((lesson) => lesson.lesson >= from && lesson.lesson <= to)
            .map((lesson) => ({
              lesson: lesson.lesson,
              title: lesson.title.trim(),
              focus: lesson.focus.trim(),
              skills: lesson.skills.map((s) => s.trim()).filter(Boolean),
            }));
          if (planItems.length === 0) continue;
          const startLesson = planItems[0];
          if (startLesson.title) {
            noticeLessonByCourse.set(courseName, { lesson: startLesson.lesson, title: startLesson.title });
          }
          const planPalette = blockColor(courseName);
          lessonPlanByCourse.set(courseName, {
            courseName,
            color: planPalette.fg,
            bg: planPalette.bg,
            items: planItems,
            layout: "summary",
          });
        }
      }
      for (const c of courses) {
        // 新學期通知只列 115-1；舊課即使仍為啟用狀態也不顯示。
        if (resolveCourseTerm(c) !== "115-1") continue;
        if (!isCourseIncluded(c)) continue;
        const day = (c.dayOfWeek || c.weekday || "").replace("星期", "週") || "週次未填";
        const start = c.startDate ? `${c.startDate.getMonth() + 1}/${c.startDate.getDate()} 起，` : "";
        const label = courseLabel(c.courseType) || "課程";
        const palette = blockColor(label);
        const entry = (roleLabel: string) => {
          const title = `${label}（${roleLabel}）`;
          const lines = [
            c.school,
            ...(opts.templateKey === "first_class"
              ? [(() => {
                  const notice = noticeLessonByCourse.get(label);
                  return `課程進度：第 ${notice?.lesson ?? 1} 堂｜${notice?.title || "尚未設定"}`;
                })()]
              : []),
            `${start}每${day} ${c.time || "時間未填"}`,
            ...(c.address ? [c.address] : []),
            ...(opts.templateKey === "first_class" ? [`報名／預計人數：${c.enrollCount.trim() || "尚未提供"}`] : []),
          ];
          return { text: [`◆ ${title}`, ...lines].join("\n"), block: { title, lines, color: palette.fg, bg: palette.bg } };
        };
        const trackLessonPlan = (teacherId: number) => {
          const set = lessonPlanCoursesByTeacher.get(teacherId) ?? new Set<string>();
          set.add(label);
          lessonPlanCoursesByTeacher.set(teacherId, set);
        };
        if (ids.includes(c.teacherId)) {
          (itemsByTeacher.get(c.teacherId) ?? itemsByTeacher.set(c.teacherId, []).get(c.teacherId)!).push(entry("主教"));
          trackLessonPlan(c.teacherId);
        }
        if (c.assistantTeacherId && ids.includes(c.assistantTeacherId)) {
          (itemsByTeacher.get(c.assistantTeacherId) ?? itemsByTeacher.set(c.assistantTeacherId, []).get(c.assistantTeacherId)!).push(entry("助教"));
          trackLessonPlan(c.assistantTeacherId);
        }
      }
    }

    return ids.map((id) => {
      const t = byId.get(id);
      if (!t) return { id, name: `#${id}`, lineUserId: null, lineRegion: "north", message: "", skipped: "找不到老師資料" };
      const items = itemsByTeacher.get(id) ?? [];
      const summary = items.map((i) => i.text).join("\n\n");
      if ((opts.templateKey === "new_term" || opts.templateKey === "first_class") && !summary) {
        return { id, name: t.name, lineUserId: t.lineUserId, lineRegion: t.lineRegion || "north", message: "", skipped: "沒有 115-1 開課課程" };
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
      // 會以 Flex 卡片送出時，內文網址點不了 → 抽成卡片按鈕
      const asCard = Boolean(template.needsAck) || items.length > 0;
      const { body: teacherBody, buttons: linkButtons } = asCard
        ? extractLinkButtons(body)
        : { body, buttons: [] as FlexLinkButton[] };
      // 課程色塊：卡片內每堂課一塊、依課程配色
      const flexParts = items.length > 0 ? buildFlexParts(teacherBody, vars) : null;
      // 第一堂課通知：主卡片之後附上該老師每門課的整學期教學課表
      const lessonPlans = opts.templateKey === "first_class"
        ? [...(lessonPlanCoursesByTeacher.get(id) ?? [])]
            .map((courseName) => lessonPlanByCourse.get(courseName))
            .filter((card): card is LessonPlanCard => Boolean(card))
        : [];
      return {
        id, name: t.name, lineUserId: t.lineUserId, lineRegion: t.lineRegion || "north",
        message: finalizeMessage(teacherBody, vars), ackToken, ackUrl,
        ...(flexParts ? { ...flexParts, flexBlocks: items.map((i) => i.block) } : {}),
        ...(linkButtons.length > 0 ? { linkButtons } : {}),
        ...(lessonPlans.length > 0 ? { lessonPlans } : {}),
      };
    });
  }

  // 園所
  const schools = await prisma.school.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, type: true, lineUserId: true },
  });
  const byId = new Map(schools.map((s) => [s.id, s]));
  const regionMap = await schoolLineRegions(ids);
  const courses = await prisma.course.findMany({
    where: { isActive: true, schoolId: { in: ids } },
    select: { schoolId: true, courseType: true, dayOfWeek: true, weekday: true, time: true, startDate: true, notes: true, teacher: { select: { name: true } } },
    orderBy: [{ courseType: "asc" }],
  });
  const itemsBySchool = new Map<number, Array<{ text: string; block: FlexBlock }>>();
  for (const c of courses) {
    if (c.schoolId == null) continue;
    // 「新學期開課通知」只帶入 115-1 課程；其他通知仍可使用所有啟用課程。
    if (opts.templateKey === "school_links" && resolveCourseTerm(c) !== "115-1") continue;
    const day = (c.dayOfWeek || c.weekday || "").replace("星期", "週") || "週次未填";
    const label = courseLabel(c.courseType) || "課程";
    const palette = blockColor(label);
    const lines = [`每${day} ${c.time || "時間未填"}`, ...(c.teacher?.name ? [`${c.teacher.name} 老師`] : [])];
    (itemsBySchool.get(c.schoolId) ?? itemsBySchool.set(c.schoolId, []).get(c.schoolId)!).push({
      text: `◆ ${label}｜每${day} ${c.time || "時間未填"}｜${c.teacher?.name ?? ""}老師`,
      block: { title: label, lines, color: palette.fg, bg: palette.bg },
    });
  }

  const results: BatchRecipientMessage[] = [];
  for (const id of ids) {
    const s = byId.get(id);
    if (!s) {
      results.push({ id, name: `#${id}`, lineUserId: null, lineRegion: "school", message: "", skipped: "找不到園所資料" });
      continue;
    }
    const items = itemsBySchool.get(id) ?? [];
    const summary = items.map((i) => i.text).join("\n");
    if (!summary && opts.templateKey !== "demo_followup") {
      const reason = opts.templateKey === "school_links" ? "沒有 115-1 開課課程" : "無進行中課程";
      results.push({ id, name: s.name, lineUserId: s.lineUserId, lineRegion: regionMap.get(id) ?? "school", message: "", skipped: reason });
      continue;
    }
    let portalLink = "";
    let confirmLink = "";
    if (opts.templateKey === "school_links") {
      const code = await getOrCreatePortalCode(id);
      portalLink = `${appUrl()}/school-portal/${encodeURIComponent(code)}`;
      // 依「園所類型」判斷，避免幼兒園只因其中一堂課的 department 標成安親而誤刪確認按鈕。
      const isAfterSchool = (s.type ?? "").includes("安親");
      confirmLink = isAfterSchool ? "" : `${portalLink}?confirmation=1`;
    }
    let effectiveBody = body;
    if (opts.templateKey === "school_links" && !confirmLink) {
      // 移除開課資料填寫區塊（標題行＋變數行）
      effectiveBody = body.split("\n").filter((line) => !line.includes("開課資料") && !line.includes("{開課確認連結}")).join("\n");
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
    // needsAck：每園所專屬「確認收到」token → 發送時以 Flex 卡片附按鈕
    const ackToken = template.needsAck ? crypto.randomBytes(16).toString("hex") : undefined;
    const ackUrl = ackToken ? `${appUrl()}/notify-ack/${ackToken}` : undefined;
    if (ackUrl) vars.確認連結 = ackUrl;
    // 課程色塊＋連結按鈕（連結改成卡片按鈕，內文不再出現網址；填寫開課資料按鈕放最前）
    const isLinks = opts.templateKey === "school_links";
    const flexParts = items.length > 0 ? buildFlexParts(effectiveBody, vars, { stripLinks: isLinks }) : null;
    const linkButtons: FlexLinkButton[] = [];
    if (isLinks && confirmLink) linkButtons.push({ label: "📝 填寫開課資料（人數／場地）", url: confirmLink, primary: true });
    if (isLinks && portalLink) linkButtons.push({ label: "📱 園所專屬看板", url: portalLink });
    results.push({
      id, name: s.name, lineUserId: s.lineUserId, lineRegion: regionMap.get(id) ?? "school",
      message: finalizeMessage(effectiveBody, vars), ackToken, ackUrl,
      ...(flexParts ? { ...flexParts, flexBlocks: items.map((i) => i.block) } : {}),
      ...(linkButtons.length > 0 ? { linkButtons } : {}),
    });
  }
  return results;
}
