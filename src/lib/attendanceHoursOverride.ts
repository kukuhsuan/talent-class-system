import { prisma } from "@/lib/prisma";

// 單堂計薪時數的「人工覆蓋」標記。
//
// 背景：課程層級有 Course.payrollHours（整學期的預設時數），出勤層級有 Attendance.hours。
// 原本的優先序是「課程預設 > 單堂」，導致行政在出勤頁把某一堂改成 1 小時、畫面也顯示 1，
// 但薪資仍然照課程預設算 —— 改了等於沒改，而且沒有任何提示。
//
// 直接把優先序反過來並不安全：Attendance.hours 有 schema 預設值 1，
// 歷史資料裡有大量「不是人工填的 1」，一旦讓它蓋過課程預設，整批舊薪資會被改小。
// 所以改用明確的覆蓋旗標：只有行政真的在出勤頁輸入過、而且和課程預設不同的那一堂，
// 才會被標記；沒有標記的資料行為與過去完全一致。
//
// 欄位採執行期補齊（與 handoffNote、scheduledTime 同模式），刻意不寫進 schema.prisma：
// 一旦寫進去，未跑 migration 前所有未指定 select 的 Attendance 查詢都會整批失敗。

let columnReady = false;

export async function ensureAttendanceHoursOverrideColumn() {
  if (columnReady) return;
  await prisma
    .$executeRawUnsafe('ALTER TABLE "Attendance" ADD COLUMN "hoursOverridden" INTEGER NOT NULL DEFAULT 0')
    .catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      if (!/already exists|duplicate column/i.test(message)) throw error;
    });
  columnReady = true;
}

/**
 * 讀取哪些出勤是人工覆蓋過時數的。欄位不存在時一律回傳未覆蓋，維持舊行為。
 * 只查有被標記的那幾筆（薪資一個月動輒上千筆，沒必要整批撈回來）。
 */
export async function attendanceHoursOverrideMap(attendanceIds: number[]) {
  const map = new Map<number, boolean>();
  const ids = [...new Set(attendanceIds.filter((id) => Number.isFinite(id) && id > 0))];
  if (ids.length === 0) return map;
  await ensureAttendanceHoursOverrideColumn();
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{ id: number }>>(
      `SELECT "id" FROM "Attendance" WHERE "hoursOverridden" = 1 AND "id" IN (${ids.map(() => "?").join(", ")})`,
      ...ids,
    );
    for (const row of rows) map.set(Number(row.id), true);
  } catch {
    // 欄位尚未建立：當作全部沒有覆蓋
  }
  return map;
}

/** 批次標記。新增排課一次會建整學期的課，逐筆 UPDATE 太慢。 */
export async function setAttendanceHoursOverrideMany(attendanceIds: number[], overridden: boolean) {
  const ids = [...new Set(attendanceIds.filter((id) => Number.isFinite(id) && id > 0))];
  if (ids.length === 0) return;
  await ensureAttendanceHoursOverrideColumn();
  await prisma.$executeRawUnsafe(
    `UPDATE "Attendance" SET "hoursOverridden" = ? WHERE "id" IN (${ids.map(() => "?").join(", ")})`,
    overridden ? 1 : 0,
    ...ids,
  );
}

/**
 * 設定／清除單堂的覆蓋標記。
 * overridden = false 代表「回到課程預設」，之後改課程時數這一堂會跟著動。
 */
export async function setAttendanceHoursOverride(attendanceId: number, overridden: boolean) {
  if (!Number.isFinite(attendanceId) || attendanceId <= 0) return;
  await ensureAttendanceHoursOverrideColumn();
  await prisma.$executeRawUnsafe(
    'UPDATE "Attendance" SET "hoursOverridden" = ? WHERE "id" = ?',
    overridden ? 1 : 0,
    attendanceId,
  );
}
