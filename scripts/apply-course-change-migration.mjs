import "dotenv/config";
import { readFile } from "node:fs/promises";
import { createClient } from "@libsql/client";

const url = process.env.TURSO_DATABASE_URL || process.env.DATABASE_URL;
if (!url) throw new Error("TURSO_DATABASE_URL 或 DATABASE_URL 尚未設定");

const sql = await readFile(new URL("../prisma/migrations/20260710090000_add_course_change_requests/migration.sql", import.meta.url), "utf8");
const statements = sql.split(/;\s*(?:\n|$)/).map((item) => item.trim()).filter(Boolean);
const client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });
let applied = 0;
let existed = 0;

for (const statement of statements) {
  try {
    await client.execute(statement);
    applied++;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/duplicate column name|already exists/i.test(message)) {
      existed++;
      continue;
    }
    throw error;
  }
}

console.log(JSON.stringify({ ok: true, applied, existed, total: statements.length }));
