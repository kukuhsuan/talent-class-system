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
    'ALTER TABLE Course ADD COLUMN address TEXT NOT NULL DEFAULT ""',
    'ALTER TABLE Attendance ADD COLUMN studentCountA INTEGER',
    'ALTER TABLE Attendance ADD COLUMN studentCountB INTEGER',
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
