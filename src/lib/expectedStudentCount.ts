import { prisma } from "@/lib/prisma";

// 預計人數（行政先填，課前提醒顯示；與老師課後回報的 studentCount 分開）
// 執行期加欄位，不進 Prisma schema，避免部署後 DDL 尚未執行時全部出勤查詢掛掉
let columnReady = false;

export async function ensureExpectedStudentCountColumn() {
  if (columnReady) return;
  await prisma.$executeRawUnsafe(`ALTER TABLE "Attendance" ADD COLUMN "expectedStudentCount" INTEGER`).catch(() => undefined);
  columnReady = true;
}

// undefined = 這次請求不更動；null = 清除
export function parseExpectedStudentCount(raw: unknown): number | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null || raw === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : undefined;
}

export async function setExpectedStudentCount(attendanceIds: number[], value: number | null) {
  const ids = attendanceIds.filter((id) => Number.isFinite(id) && id > 0);
  if (ids.length === 0) return;
  await ensureExpectedStudentCountColumn();
  await prisma.$executeRawUnsafe(
    `UPDATE "Attendance" SET "expectedStudentCount" = ? WHERE "id" IN (${ids.map(() => "?").join(",")})`,
    value,
    ...ids,
  );
}

export async function expectedStudentCountMap(attendanceIds: number[]) {
  const ids = [...new Set(attendanceIds.filter((id) => Number.isFinite(id) && id > 0))];
  if (ids.length === 0) return new Map<number, number>();
  await ensureExpectedStudentCountColumn();
  const rows = await prisma.$queryRawUnsafe<Array<{ id: number; expectedStudentCount: number | null }>>(
    `SELECT "id", "expectedStudentCount" FROM "Attendance" WHERE "id" IN (${ids.map(() => "?").join(",")})`,
    ...ids,
  );
  const map = new Map<number, number>();
  for (const row of rows) {
    if (row.expectedStudentCount != null) map.set(Number(row.id), Number(row.expectedStudentCount));
  }
  return map;
}
