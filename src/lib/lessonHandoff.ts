import { prisma } from "@/lib/prisma";
import { courseLabel } from "@/lib/courseMeta";

// 上一堂回顧：老師在課後回報寫下的交接提醒 + 上一堂實際上到哪，
// 於下一堂課前隨課程提醒一起推播給接手的老師（同一位老師也照送，當作課前回顧）。

export type LessonRecap = {
  courseId: number;
  date: string; // YYYY-MM-DD
  teacherId: number;
  teacherName: string;
  courseName: string;
  school: string;
  progress: string;
  outcome: string;
  handoffNote: string;
  incidentSummary: string;
  studentCount: number | null;
};

let handoffColumnReady = false;

// 執行期補欄位（與 schoolSignature 同模式），部署後不必先手動跑 migration。
// 刻意不寫進 schema.prisma：一旦寫進去，未跑 migration 前所有未指定 select 的
// Attendance 查詢都會 SELECT 到不存在的欄位而整批失敗。
export async function ensureHandoffNoteColumn() {
  if (handoffColumnReady) return;
  await prisma
    .$executeRawUnsafe('ALTER TABLE "Attendance" ADD COLUMN "handoffNote" TEXT NOT NULL DEFAULT ""')
    .catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      if (!/already exists|duplicate column/i.test(message)) throw error;
    });
  handoffColumnReady = true;
}

// handoffNote 以原生 SQL 存取：欄位是後加的，避免綁死在特定版本的 Prisma Client 型別上
export async function readHandoffNotes(attendanceIds: number[]) {
  const map = new Map<number, string>();
  const ids = [...new Set(attendanceIds.filter((id) => Number.isFinite(id) && id > 0))];
  if (ids.length === 0) return map;
  await ensureHandoffNoteColumn();
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{ id: number; handoffNote: string | null }>>(
      `SELECT "id", "handoffNote" FROM "Attendance" WHERE "id" IN (${ids.map(() => "?").join(", ")})`,
      ...ids,
    );
    for (const row of rows) map.set(Number(row.id), (row.handoffNote ?? "").trim());
  } catch {
    // 欄位尚未建立時當作沒有交接內容
  }
  return map;
}

export async function writeHandoffNote(attendanceId: number, note: string) {
  await ensureHandoffNoteColumn();
  await prisma.$executeRawUnsafe(
    'UPDATE "Attendance" SET "handoffNote" = ? WHERE "id" = ?',
    note.slice(0, 500),
    attendanceId,
  );
}

function reportField(content: string, label: string) {
  const line = content.split("\n").find((row) => row.startsWith(`${label}：`));
  return line ? line.slice(label.length + 1).trim() : "";
}

function incidentSummary(row: {
  incident: boolean;
  incidentChild: string;
  incidentProcess: string;
  incidentAction: string;
}) {
  if (!row.incident) return "";
  return [row.incidentChild, row.incidentProcess, row.incidentAction]
    .map((item) => item.trim())
    .filter(Boolean)
    .join("｜");
}

function isoOf(date: Date) {
  return date.toISOString().slice(0, 10);
}

/**
 * 找出這些課程在 beforeIso 之前「最後一堂已送出回報」的紀錄。
 * 回傳 Map<courseId, LessonRecap>；沒有可回顧的內容（進度、交接、事件全空）就不放進 Map。
 */
export async function previousLessonRecapMap(courseIds: number[], beforeIso: string) {
  const map = new Map<number, LessonRecap>();
  const ids = [...new Set(courseIds.filter((id) => Number.isFinite(id) && id > 0))];
  if (ids.length === 0) return map;

  const rows = await prisma.attendance.findMany({
    where: {
      courseId: { in: ids },
      cancelled: false,
      date: { lt: new Date(`${beforeIso}T00:00:00.000Z`) },
      reportSentAt: { not: null },
    },
    orderBy: [{ courseId: "asc" }, { date: "desc" }],
    select: {
      id: true,
      courseId: true,
      date: true,
      reportContent: true,
      incident: true,
      incidentChild: true,
      incidentProcess: true,
      incidentAction: true,
      studentCount: true,
      actualTeacherId: true,
      actualTeacher: { select: { name: true } },
      course: { select: { school: true, courseType: true } },
    },
  });

  // 每個課程只留最近一堂，先挑出來再補撈交接內容，避免整學期的紀錄都跑一次
  const latest = new Map<number, (typeof rows)[number]>();
  for (const row of rows) if (!latest.has(row.courseId)) latest.set(row.courseId, row);
  const noteMap = await readHandoffNotes([...latest.values()].map((row) => row.id));

  for (const row of latest.values()) {
    const progress =
      reportField(row.reportContent, "課程進度") || reportField(row.reportContent, "訓練內容");
    const outcome = reportField(row.reportContent, "成果回報");
    const handoffNote = noteMap.get(row.id) ?? "";
    const incident = incidentSummary(row);
    if (!progress && !handoffNote && !incident && !outcome) continue;
    map.set(row.courseId, {
      courseId: row.courseId,
      date: isoOf(row.date),
      teacherId: row.actualTeacherId,
      teacherName: row.actualTeacher.name,
      courseName: courseLabel(row.course.courseType) || row.course.courseType,
      school: row.course.school,
      progress,
      outcome,
      handoffNote,
      incidentSummary: incident,
      studentCount: row.studentCount,
    });
  }

  return map;
}

function textRow(label: string, value: string, color: string) {
  return {
    type: "box",
    // 用 horizontal 而非 baseline：baseline box 內的 text 不支援 wrap，進度文字會被截斷
    layout: "horizontal",
    spacing: "sm",
    contents: [
      { type: "text", text: label, size: "xs", color: "#8391A3", flex: 3, wrap: true },
      { type: "text", text: value, size: "sm", color, flex: 9, wrap: true },
    ],
  };
}

/**
 * 上一堂回顧卡片，接在課程提醒後面一起 push。
 * 同一位老師也會收到（自己回顧自己上一堂寫的交接）。
 */
export function buildLessonRecapFlex(recap: LessonRecap, opts: { sameTeacher: boolean }) {
  const rows: object[] = [];
  if (recap.progress) rows.push(textRow("上到進度", recap.progress, "#263548"));
  if (recap.outcome) rows.push(textRow("課堂摘要", recap.outcome, "#4A5A6D"));
  if (recap.studentCount != null) rows.push(textRow("出席人數", `${recap.studentCount} 人`, "#4A5A6D"));
  if (recap.incidentSummary) rows.push(textRow("特殊事件", recap.incidentSummary, "#C0564B"));

  const body: object[] = [
    {
      type: "box",
      layout: "vertical",
      backgroundColor: "#F6F8FB",
      cornerRadius: "10px",
      paddingAll: "12px",
      spacing: "sm",
      contents: rows.length > 0 ? rows : [{ type: "text", text: "上一堂沒有填寫進度內容", size: "sm", color: "#8391A3", wrap: true }],
    },
  ];

  if (recap.handoffNote) {
    body.push({
      type: "box",
      layout: "vertical",
      backgroundColor: "#FFF7E8",
      cornerRadius: "10px",
      paddingAll: "12px",
      spacing: "xs",
      contents: [
        {
          type: "text",
          // 這張卡主要給接手／代課的老師看，文案一律站在「接下來要上這堂課的人」的角度
          text: opts.sameTeacher ? "上次你留下的交接事項" : `${recap.teacherName}老師的交接事項`,
          size: "xs",
          weight: "bold",
          color: "#B0722B",
        },
        { type: "text", text: recap.handoffNote, size: "sm", color: "#7A5416", wrap: true },
      ],
    });
  }

  return {
    type: "flex",
    altText: `上一堂回顧｜${recap.school} ${recap.courseName}（${recap.date}）`,
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#2C5DA8",
        paddingAll: "16px",
        spacing: "xs",
        contents: [
          { type: "text", text: "上一堂回顧", color: "#FFFFFF", weight: "bold", size: "lg" },
          {
            type: "text",
            text: `${recap.school}　${recap.courseName}`,
            color: "#EAF2FF",
            size: "sm",
            wrap: true,
          },
          {
            type: "text",
            text: `${recap.date}　由 ${recap.teacherName} 老師授課`,
            color: "#C7DAF6",
            size: "xs",
            wrap: true,
          },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#FFFFFF",
        paddingAll: "14px",
        spacing: "md",
        contents: body,
      },
      footer: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#FAFBFC",
        paddingAll: "12px",
        contents: [
          {
            type: "text",
            text: "請接續上面的進度上課。現場狀況若和這裡不一樣，課後回報時填實際情形就好。",
            size: "xxs",
            color: "#8391A3",
            wrap: true,
          },
        ],
      },
    },
  };
}
