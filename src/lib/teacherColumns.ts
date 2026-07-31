import { prisma } from "@/lib/prisma";

// 正式環境是 Turso，不跑 prisma migrate；新欄位一律用 ALTER TABLE 補上。
// 比照 attendanceTime.ts 的 scheduledTimeColumnReady 作法，用 module 旗標避免重複 PRAGMA。
let teacherColumnsReady = false;

const TEACHER_COLUMNS: Array<[column: string, ddl: string]> = [
  ["bankRemitNotes", 'ALTER TABLE "Teacher" ADD COLUMN "bankRemitNotes" TEXT NOT NULL DEFAULT \'\''],
  ["firstPaidMonth", 'ALTER TABLE "Teacher" ADD COLUMN "firstPaidMonth" TEXT NOT NULL DEFAULT \'\''],
  ["lastPaidMonth", 'ALTER TABLE "Teacher" ADD COLUMN "lastPaidMonth" TEXT NOT NULL DEFAULT \'\''],
  ["lastPaidAt", 'ALTER TABLE "Teacher" ADD COLUMN "lastPaidAt" DATETIME'],
  ["isCollegeStudent", 'ALTER TABLE "Teacher" ADD COLUMN "isCollegeStudent" BOOLEAN NOT NULL DEFAULT false'],
  ["emergencyContact", 'ALTER TABLE "Teacher" ADD COLUMN "emergencyContact" TEXT NOT NULL DEFAULT \'\''],
  ["salaryNotes", 'ALTER TABLE "Teacher" ADD COLUMN "salaryNotes" TEXT NOT NULL DEFAULT \'\''],
  ["teachingSubjects", 'ALTER TABLE "Teacher" ADD COLUMN "teachingSubjects" TEXT NOT NULL DEFAULT \'\''],
  // 文件上傳連結的世代編號：+1 就能讓該老師手上所有舊連結立刻失效。
  // 不用改 AUTH_SECRET，那會一次打死報告、履歷、園所入口所有公開連結。
  ["docLinkEpoch", 'ALTER TABLE "Teacher" ADD COLUMN "docLinkEpoch" INTEGER NOT NULL DEFAULT 0'],
];

export async function ensureTeacherExtendedColumns() {
  if (teacherColumnsReady) return;
  const existing = await prisma.$queryRawUnsafe<Array<{ name: string }>>('PRAGMA table_info("Teacher")');
  const present = new Set(existing.map((row) => row.name));
  for (const [column, ddl] of TEACHER_COLUMNS) {
    if (present.has(column)) continue;
    // 併發啟動時可能有另一個 instance 已經加過欄位，重複執行會噴錯，忽略即可。
    await prisma.$executeRawUnsafe(ddl).catch(() => undefined);
  }
  teacherColumnsReady = true;
}

// 授課項目存 JSON 陣列字串；舊資料或手動填的逗號分隔字串也要能讀。
export function parseTeachingSubjects(value: string | null | undefined): string[] {
  const text = String(value ?? "").trim();
  if (!text) return [];
  if (text.startsWith("[")) {
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) return parsed.map((item) => String(item).trim()).filter(Boolean);
    } catch {
      // 落到下面的逗號分隔解析
    }
  }
  return text.split(/[,，、]/).map((item) => item.trim()).filter(Boolean);
}

export function serializeTeachingSubjects(value: unknown): string {
  if (Array.isArray(value)) {
    const items = value.map((item) => String(item).trim()).filter(Boolean);
    return items.length > 0 ? JSON.stringify(items) : "";
  }
  const items = parseTeachingSubjects(typeof value === "string" ? value : "");
  return items.length > 0 ? JSON.stringify(items) : "";
}
