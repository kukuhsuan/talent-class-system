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
    'ALTER TABLE School ADD COLUMN type TEXT NOT NULL DEFAULT ""',
    'ALTER TABLE Course ADD COLUMN address TEXT NOT NULL DEFAULT ""',
    'ALTER TABLE Attendance ADD COLUMN studentCountA INTEGER',
    'ALTER TABLE Attendance ADD COLUMN studentCountB INTEGER',
    'CREATE TABLE IF NOT EXISTS CourseProgress (id INTEGER PRIMARY KEY AUTOINCREMENT, courseType TEXT NOT NULL, lesson INTEGER NOT NULL, title TEXT NOT NULL, createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)',
    'CREATE UNIQUE INDEX IF NOT EXISTS CourseProgress_courseType_lesson_key ON CourseProgress(courseType, lesson)',
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
