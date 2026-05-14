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
    'ALTER TABLE Course ADD COLUMN address TEXT NOT NULL DEFAULT ""',
    'ALTER TABLE Attendance ADD COLUMN studentCountA INTEGER',
    'ALTER TABLE Attendance ADD COLUMN studentCountB INTEGER',
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
