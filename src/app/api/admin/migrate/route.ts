import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@libsql/client";

export async function POST(req: NextRequest) {
  const { secret } = await req.json();
  if (secret !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const client = createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });

  const results: string[] = [];

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
    'ALTER TABLE Attendance ADD COLUMN schoolNotifyStatus TEXT NOT NULL DEFAULT "未通知"',
    'ALTER TABLE Attendance ADD COLUMN schoolNotifyError TEXT NOT NULL DEFAULT ""',
    'ALTER TABLE Attendance ADD COLUMN schoolNotifiedAt DATETIME',
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

  for (const sql of migrations) {
    try {
      await client.execute(sql);
      results.push(`OK: ${sql}`);
    } catch (e: unknown) {
      results.push(`SKIP: ${(e as Error).message}`);
    }
  }

  return NextResponse.json({ results });
}
