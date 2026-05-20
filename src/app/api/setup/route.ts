import { NextResponse } from "next/server";
import { createClient } from "@libsql/client";

// Public idempotent migration endpoint — safe to call multiple times
// All ALTER TABLE use try/catch so they skip if column already exists
export async function GET() {
  const client = createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });

  const migrations = [
    'ALTER TABLE Teacher ADD COLUMN email TEXT NOT NULL DEFAULT ""',
    'ALTER TABLE Teacher ADD COLUMN phone TEXT NOT NULL DEFAULT ""',
    'ALTER TABLE Teacher ADD COLUMN isAssistant BOOLEAN NOT NULL DEFAULT false',
    'ALTER TABLE Teacher ADD COLUMN assistantFee INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE School ADD COLUMN type TEXT NOT NULL DEFAULT ""',
    'ALTER TABLE Course ADD COLUMN address TEXT NOT NULL DEFAULT ""',
    'ALTER TABLE Attendance ADD COLUMN studentCountA INTEGER',
    'ALTER TABLE Attendance ADD COLUMN studentCountB INTEGER',
    'ALTER TABLE Attendance ADD COLUMN cancelReason TEXT NOT NULL DEFAULT ""',
    'ALTER TABLE Attendance ADD COLUMN makeupDate DATETIME',
    'ALTER TABLE Attendance ADD COLUMN makeupDone BOOLEAN NOT NULL DEFAULT false',
    'ALTER TABLE Attendance ADD COLUMN skillFocus TEXT NOT NULL DEFAULT ""',
    'ALTER TABLE Attendance ADD COLUMN classStatus TEXT NOT NULL DEFAULT ""',
    'ALTER TABLE Attendance ADD COLUMN incident BOOLEAN NOT NULL DEFAULT false',
    'ALTER TABLE Attendance ADD COLUMN incidentChild TEXT NOT NULL DEFAULT ""',
    'ALTER TABLE Attendance ADD COLUMN incidentProcess TEXT NOT NULL DEFAULT ""',
    'ALTER TABLE Attendance ADD COLUMN incidentAction TEXT NOT NULL DEFAULT ""',
    'ALTER TABLE Attendance ADD COLUMN incidentNotified TEXT NOT NULL DEFAULT ""',
    'ALTER TABLE Attendance ADD COLUMN reportPhotos TEXT NOT NULL DEFAULT ""',
    'ALTER TABLE Attendance ADD COLUMN aiSummary TEXT NOT NULL DEFAULT ""',
    'ALTER TABLE Attendance ADD COLUMN aiSkillFocus TEXT NOT NULL DEFAULT ""',
    'ALTER TABLE Attendance ADD COLUMN aiTeachingNote TEXT NOT NULL DEFAULT ""',
    'CREATE TABLE IF NOT EXISTS CourseProgress (id INTEGER PRIMARY KEY AUTOINCREMENT, courseType TEXT NOT NULL, lesson INTEGER NOT NULL, title TEXT NOT NULL, createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)',
    'CREATE UNIQUE INDEX IF NOT EXISTS CourseProgress_courseType_lesson_key ON CourseProgress(courseType, lesson)',
    'CREATE TABLE IF NOT EXISTS CourseOption (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL UNIQUE, label TEXT NOT NULL, isActive BOOLEAN NOT NULL DEFAULT true, createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)',
    'CREATE TABLE IF NOT EXISTS UserAccount (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL UNIQUE, name TEXT NOT NULL, passwordHash TEXT NOT NULL, role TEXT NOT NULL DEFAULT "admin", isActive BOOLEAN NOT NULL DEFAULT true, createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)',
    'CREATE TABLE IF NOT EXISTS KindergartenAssessment (id INTEGER PRIMARY KEY AUTOINCREMENT, attendanceId INTEGER NOT NULL, childName TEXT NOT NULL, semester TEXT NOT NULL DEFAULT "", courseName TEXT NOT NULL DEFAULT "", scores TEXT NOT NULL DEFAULT "", comment TEXT NOT NULL DEFAULT "", title TEXT NOT NULL DEFAULT "", certificatePayload TEXT NOT NULL DEFAULT "", createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)',
    'CREATE INDEX IF NOT EXISTS KindergartenAssessment_attendanceId_idx ON KindergartenAssessment(attendanceId)',
  ];

  const results: string[] = [];
  for (const sql of migrations) {
    try {
      await client.execute(sql);
      results.push(`✅ ${sql}`);
    } catch (e: unknown) {
      results.push(`⏭️ already exists: ${(e as Error).message.split("\n")[0]}`);
    }
  }

  return NextResponse.json({ ok: true, results });
}
