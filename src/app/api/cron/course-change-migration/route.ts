import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@libsql/client";

export const dynamic = "force-dynamic";

const statements: string[] = [
  `ALTER TABLE "Course" ADD COLUMN "location" TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE "Attendance" ADD COLUMN "scheduledSchoolId" INTEGER`,
  `ALTER TABLE "Attendance" ADD COLUMN "scheduledSchoolName" TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE "Attendance" ADD COLUMN "scheduledAddress" TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE "Attendance" ADD COLUMN "scheduledLocation" TEXT NOT NULL DEFAULT ''`,
  `CREATE INDEX IF NOT EXISTS "Attendance_scheduledSchoolId_idx" ON "Attendance"("scheduledSchoolId")`,
  `CREATE TABLE IF NOT EXISTS "CourseChangeRequest" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "courseId" INTEGER NOT NULL,
    "teacherId" INTEGER NOT NULL,
    "primaryAttendanceId" INTEGER NOT NULL,
    "requestSource" TEXT NOT NULL DEFAULT 'ADMIN',
    "requestedByUserId" INTEGER,
    "requestedBySchoolId" INTEGER,
    "requestedByName" TEXT NOT NULL DEFAULT '',
    "changeScope" TEXT NOT NULL DEFAULT 'SINGLE',
    "changeTypes" TEXT NOT NULL DEFAULT '[]',
    "originalDate" DATETIME NOT NULL,
    "newDate" DATETIME,
    "originalStartTime" TEXT NOT NULL DEFAULT '',
    "originalEndTime" TEXT NOT NULL DEFAULT '',
    "newStartTime" TEXT NOT NULL DEFAULT '',
    "newEndTime" TEXT NOT NULL DEFAULT '',
    "originalSchoolId" INTEGER,
    "newSchoolId" INTEGER,
    "originalSchoolName" TEXT NOT NULL DEFAULT '',
    "newSchoolName" TEXT NOT NULL DEFAULT '',
    "originalAddress" TEXT NOT NULL DEFAULT '',
    "newAddress" TEXT NOT NULL DEFAULT '',
    "originalLocation" TEXT NOT NULL DEFAULT '',
    "newLocation" TEXT NOT NULL DEFAULT '',
    "reasonType" TEXT NOT NULL,
    "reasonNote" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT '待行政審核',
    "reviewNote" TEXT NOT NULL DEFAULT '',
    "returnedAt" DATETIME,
    "lineSentAt" DATETIME,
    "teacherResponse" TEXT NOT NULL DEFAULT '',
    "teacherRespondedAt" DATETIME,
    "reviewedByUserId" INTEGER,
    "reviewedByName" TEXT NOT NULL DEFAULT '',
    "reviewedAt" DATETIME,
    "appliedByUserId" INTEGER,
    "appliedByName" TEXT NOT NULL DEFAULT '',
    "appliedAt" DATETIME,
    "cancelledAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CourseChangeRequest_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CourseChangeRequest_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE RESTRICT ON UPDATE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS "CourseChangeRequest_courseId_idx" ON "CourseChangeRequest"("courseId")`,
  `CREATE INDEX IF NOT EXISTS "CourseChangeRequest_teacherId_idx" ON "CourseChangeRequest"("teacherId")`,
  `CREATE INDEX IF NOT EXISTS "CourseChangeRequest_primaryAttendanceId_idx" ON "CourseChangeRequest"("primaryAttendanceId")`,
  `CREATE INDEX IF NOT EXISTS "CourseChangeRequest_requestedBySchoolId_idx" ON "CourseChangeRequest"("requestedBySchoolId")`,
  `CREATE INDEX IF NOT EXISTS "CourseChangeRequest_status_idx" ON "CourseChangeRequest"("status")`,
  `CREATE INDEX IF NOT EXISTS "CourseChangeRequest_requestSource_idx" ON "CourseChangeRequest"("requestSource")`,
  `CREATE INDEX IF NOT EXISTS "CourseChangeRequest_createdAt_idx" ON "CourseChangeRequest"("createdAt")`,
  `CREATE TABLE IF NOT EXISTS "CourseChangeRequestTarget" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "requestId" INTEGER NOT NULL,
    "attendanceId" INTEGER NOT NULL,
    "originalDate" DATETIME NOT NULL,
    "originalTime" TEXT NOT NULL DEFAULT '',
    "originalSchoolId" INTEGER,
    "originalSchoolName" TEXT NOT NULL DEFAULT '',
    "originalAddress" TEXT NOT NULL DEFAULT '',
    "originalLocation" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CourseChangeRequestTarget_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "CourseChangeRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CourseChangeRequestTarget_attendanceId_fkey" FOREIGN KEY ("attendanceId") REFERENCES "Attendance"("id") ON DELETE RESTRICT ON UPDATE CASCADE
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "CourseChangeRequestTarget_requestId_attendanceId_key" ON "CourseChangeRequestTarget"("requestId", "attendanceId")`,
  `CREATE INDEX IF NOT EXISTS "CourseChangeRequestTarget_attendanceId_idx" ON "CourseChangeRequestTarget"("attendanceId")`,
  `CREATE TABLE IF NOT EXISTS "CourseChangeRequestEvent" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "requestId" INTEGER NOT NULL,
    "actorType" TEXT NOT NULL DEFAULT '',
    "actorId" INTEGER,
    "actorName" TEXT NOT NULL DEFAULT '',
    "action" TEXT NOT NULL,
    "fromStatus" TEXT NOT NULL DEFAULT '',
    "toStatus" TEXT NOT NULL DEFAULT '',
    "note" TEXT NOT NULL DEFAULT '',
    "beforeData" TEXT NOT NULL DEFAULT '',
    "afterData" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CourseChangeRequestEvent_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "CourseChangeRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS "CourseChangeRequestEvent_requestId_createdAt_idx" ON "CourseChangeRequestEvent"("requestId", "createdAt")`,
  `ALTER TABLE "CourseChangeRequest" ADD COLUMN "newStudentCount" INTEGER`,
];

function isAlreadyApplied(message: string) {
  return /duplicate column name|already exists/i.test(message);
}

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret") ?? "";
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "未授權" }, { status: 401 });
  }
  const url = process.env.TURSO_DATABASE_URL?.trim();
  if (!url) {
    return NextResponse.json({ error: "缺少 TURSO_DATABASE_URL" }, { status: 500 });
  }
  const client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN?.trim() || undefined });
  const results: { status: string; sql: string }[] = [];
  try {
    for (const sql of statements) {
      try {
        await client.execute(sql);
        results.push({ status: "applied", sql: sql.slice(0, 80) });
      } catch (error) {
        const message = (error as Error).message ?? "";
        if (isAlreadyApplied(message)) {
          results.push({ status: "exists", sql: sql.slice(0, 80) });
        } else {
          return NextResponse.json({ ok: false, failedSql: sql, error: message, results }, { status: 500 });
        }
      }
    }
    return NextResponse.json({
      ok: true,
      applied: results.filter((r) => r.status === "applied").length,
      existed: results.filter((r) => r.status === "exists").length,
      total: statements.length,
      results,
    });
  } finally {
    client.close();
  }
}
