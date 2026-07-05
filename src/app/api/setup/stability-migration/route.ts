import { createClient } from "@libsql/client";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const statements = [
  'ALTER TABLE "Attendance" ADD COLUMN "isPayrollLocked" BOOLEAN NOT NULL DEFAULT false',
  'ALTER TABLE "Attendance" ADD COLUMN "payrollLockedAt" DATETIME',
  'ALTER TABLE "Course" ADD COLUMN "recurrenceType" TEXT NOT NULL DEFAULT \'\'',
  'ALTER TABLE "Course" ADD COLUMN "startDate" DATETIME',
  'ALTER TABLE "Course" ADD COLUMN "endDate" DATETIME',
  'ALTER TABLE "Course" ADD COLUMN "weekday" TEXT NOT NULL DEFAULT \'\'',
  'CREATE INDEX IF NOT EXISTS "Attendance_isPayrollLocked_idx" ON "Attendance"("isPayrollLocked")',
  `CREATE TABLE IF NOT EXISTS "CourseScheduleException" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "courseId" INTEGER NOT NULL,
    "date" DATETIME NOT NULL,
    "type" TEXT NOT NULL,
    "replacementDate" DATETIME,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CourseScheduleException_courseId_fkey"
      FOREIGN KEY ("courseId") REFERENCES "Course" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
  )`,
  'CREATE INDEX IF NOT EXISTS "CourseScheduleException_courseId_date_idx" ON "CourseScheduleException"("courseId", "date")',
  'CREATE INDEX IF NOT EXISTS "CourseScheduleException_type_idx" ON "CourseScheduleException"("type")',
  'ALTER TABLE "Substitute" ADD COLUMN "attendanceId" INTEGER REFERENCES "Attendance"("id") ON DELETE SET NULL',
  'ALTER TABLE "Substitute" ADD COLUMN "role" TEXT NOT NULL DEFAULT \'主教\'',
  'CREATE UNIQUE INDEX IF NOT EXISTS "Substitute_attendanceId_role_key" ON "Substitute"("attendanceId", "role")',
  'CREATE INDEX IF NOT EXISTS "Substitute_attendanceId_idx" ON "Substitute"("attendanceId")',
  `CREATE TABLE IF NOT EXISTS "TeacherLeaveRequest" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "teacherId" INTEGER NOT NULL,
    "attendanceId" INTEGER NOT NULL,
    "courseId" INTEGER NOT NULL,
    "role" TEXT NOT NULL DEFAULT '主教',
    "leaveDate" DATETIME NOT NULL,
    "startTime" TEXT NOT NULL DEFAULT '',
    "endTime" TEXT NOT NULL DEFAULT '',
    "reason" TEXT NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT '待審核',
    "semesterLeaveCountAtSubmit" INTEGER NOT NULL DEFAULT 0,
    "reviewedBy" TEXT NOT NULL DEFAULT '',
    "reviewedAt" DATETIME,
    "rejectedReason" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TeacherLeaveRequest_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TeacherLeaveRequest_attendanceId_fkey" FOREIGN KEY ("attendanceId") REFERENCES "Attendance" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TeacherLeaveRequest_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
  )`,
  'CREATE INDEX IF NOT EXISTS "TeacherLeaveRequest_teacherId_leaveDate_idx" ON "TeacherLeaveRequest"("teacherId", "leaveDate")',
  'CREATE INDEX IF NOT EXISTS "TeacherLeaveRequest_attendanceId_idx" ON "TeacherLeaveRequest"("attendanceId")',
  'CREATE INDEX IF NOT EXISTS "TeacherLeaveRequest_courseId_idx" ON "TeacherLeaveRequest"("courseId")',
  'CREATE INDEX IF NOT EXISTS "TeacherLeaveRequest_status_idx" ON "TeacherLeaveRequest"("status")',
  `CREATE TABLE IF NOT EXISTS "SubstituteInquiry" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "leaveRequestId" INTEGER NOT NULL,
    "attendanceId" INTEGER NOT NULL,
    "candidateTeacherId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "sentAt" DATETIME,
    "respondedAt" DATETIME,
    "lineMessageId" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SubstituteInquiry_leaveRequestId_fkey" FOREIGN KEY ("leaveRequestId") REFERENCES "TeacherLeaveRequest" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SubstituteInquiry_attendanceId_fkey" FOREIGN KEY ("attendanceId") REFERENCES "Attendance" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SubstituteInquiry_candidateTeacherId_fkey" FOREIGN KEY ("candidateTeacherId") REFERENCES "Teacher" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
  )`,
  'CREATE UNIQUE INDEX IF NOT EXISTS "SubstituteInquiry_leaveRequestId_candidateTeacherId_key" ON "SubstituteInquiry"("leaveRequestId", "candidateTeacherId")',
  'CREATE INDEX IF NOT EXISTS "SubstituteInquiry_attendanceId_idx" ON "SubstituteInquiry"("attendanceId")',
  'CREATE INDEX IF NOT EXISTS "SubstituteInquiry_candidateTeacherId_idx" ON "SubstituteInquiry"("candidateTeacherId")',
  'CREATE INDEX IF NOT EXISTS "SubstituteInquiry_status_idx" ON "SubstituteInquiry"("status")',
];

function isAlreadyApplied(message: string) {
  return /duplicate column name|already exists/i.test(message);
}

export async function GET() {
  const url = process.env.TURSO_DATABASE_URL;
  if (!url) {
    return NextResponse.json(
      { error: "TURSO_DATABASE_URL 尚未設定" },
      { status: 500 },
    );
  }

  const client = createClient({
    url,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });
  const results: Array<{ status: "applied" | "exists"; sql: string }> = [];

  for (const sql of statements) {
    try {
      await client.execute(sql);
      results.push({ status: "applied", sql });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (isAlreadyApplied(message)) {
        results.push({ status: "exists", sql });
        continue;
      }

      return NextResponse.json(
        {
          error: "結構 migration 執行失敗",
          message,
          structuralOnly: true,
          backfill: false,
          results,
        },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({
    ok: true,
    structuralOnly: true,
    backfill: false,
    results,
  });
}
