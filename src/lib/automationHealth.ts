import { prisma } from "@/lib/prisma";

export type AutomationRunStatus = "success" | "partial" | "failed";

let tableReady = false;
export async function ensureAutomationRunTable() {
  if (tableReady) return;
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS AutomationRun (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      jobKey TEXT NOT NULL,
      targetDate TEXT NOT NULL,
      status TEXT NOT NULL,
      total INTEGER NOT NULL DEFAULT 0,
      success INTEGER NOT NULL DEFAULT 0,
      failed INTEGER NOT NULL DEFAULT 0,
      details TEXT NOT NULL DEFAULT '',
      ranAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(jobKey, targetDate)
    )
  `);
  tableReady = true;
}

export async function recordAutomationRun(input: {
  jobKey: string;
  targetDate: string;
  status: AutomationRunStatus;
  total: number;
  success: number;
  failed: number;
  details?: string;
}) {
  await ensureAutomationRunTable();
  await prisma.$executeRawUnsafe(
    `INSERT INTO AutomationRun (jobKey, targetDate, status, total, success, failed, details, ranAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(jobKey, targetDate) DO UPDATE SET
       status = excluded.status,
       total = excluded.total,
       success = excluded.success,
       failed = excluded.failed,
       details = excluded.details,
       ranAt = CURRENT_TIMESTAMP`,
    input.jobKey,
    input.targetDate,
    input.status,
    input.total,
    input.success,
    input.failed,
    input.details?.slice(0, 2000) ?? "",
  );
}

export async function automationRunsForDates(dates: string[]) {
  await ensureAutomationRunTable();
  if (!dates.length) return [];
  return prisma.$queryRawUnsafe<Array<{
    jobKey: string;
    targetDate: string;
    status: string;
    total: number;
    success: number;
    failed: number;
    details: string;
    ranAt: string | Date;
  }>>(
    `SELECT jobKey, targetDate, status, total, success, failed, details, ranAt
     FROM AutomationRun
     WHERE targetDate IN (${dates.map(() => "?").join(",")})
     ORDER BY ranAt DESC`,
    ...dates,
  );
}
