import { NextResponse } from "next/server";
import { createClient } from "@libsql/client";

// One-time idempotent index migration — safe to call multiple times (IF NOT EXISTS)
export async function GET() {
  const client = createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });

  const sqls = [
    'CREATE INDEX IF NOT EXISTS "Attendance_cancelled_idx" ON "Attendance"("cancelled")',
    'CREATE INDEX IF NOT EXISTS "Attendance_category_idx" ON "Attendance"("category")',
    'CREATE INDEX IF NOT EXISTS "Course_isActive_idx" ON "Course"("isActive")',
    'CREATE INDEX IF NOT EXISTS "Course_department_idx" ON "Course"("department")',
  ];

  const results: string[] = [];
  for (const sql of sqls) {
    try {
      await client.execute(sql);
      results.push(`✅ ${sql}`);
    } catch (e: unknown) {
      results.push(`⏭️ ${(e as Error).message.split("\n")[0]}`);
    }
  }

  return NextResponse.json({ ok: true, results });
}
