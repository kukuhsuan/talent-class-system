import { prisma } from "@/lib/prisma";

let courseTravelFeeColumnReady = false;

/** 舊資料庫可在不中斷服務的情況下補上課程固定車資欄位。 */
export async function ensureCourseTravelFeeColumn() {
  if (courseTravelFeeColumnReady) return;

  const columns = await prisma.$queryRawUnsafe<Array<{ name: string }>>('PRAGMA table_info("Course")');
  if (!columns.some((column) => column.name === "travelFee")) {
    await prisma.$executeRawUnsafe('ALTER TABLE "Course" ADD COLUMN "travelFee" INTEGER').catch(() => undefined);
  }
  courseTravelFeeColumnReady = true;
}

/** null＝尚未改用課程車資（沿用老師舊設定）；0＝明確無車資；正數＝每堂固定車資。 */
export function parseCourseTravelFee(value: unknown): number | null {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const amount = Number(value);
  if (!Number.isInteger(amount) || amount < 0) throw new Error("固定車資必須是 0 以上的整數");
  return amount;
}

export function attendanceHasCompletedReport(row: {
  reportSentAt: Date | null;
  reportContent: string;
  studentCount: number | null;
  studentCountA: number | null;
  studentCountB: number | null;
}) {
  return Boolean(
    row.reportSentAt
    || String(row.reportContent ?? "").trim()
    || row.studentCount !== null
    || row.studentCountA !== null
    || row.studentCountB !== null,
  );
}

export function resolvedTravelFee(input: {
  courseTravelFee: number | null;
  legacyTeacherTravelFee: number;
  completed: boolean;
  eligible: boolean;
}) {
  if (!input.eligible) return 0;
  // 尚未在課程上設定的舊課，維持原本老師車資規則，避免部署後既有薪資突然歸零。
  if (input.courseTravelFee === null) return input.legacyTeacherTravelFee;
  return input.completed ? input.courseTravelFee : 0;
}
