import { createHash, randomInt } from "crypto";
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requiredAuthSecret } from "@/lib/authSecret";

// 園所端 6 位數驗證碼 + 裝置 Session（30 天）
// - 驗證碼由公司後台產生，bcrypt 雜湊儲存（不存明碼）
// - 連續錯 5 次鎖 15 分鐘
// - 驗證成功後發 HttpOnly Session Cookie；後台可 sessionVersion+1 登出所有裝置

const SESSION_COOKIE = "portal_session";
const MAX_FAILS = 5;
const LOCK_MINUTES = 15;

let tableReady = false;
export async function ensurePortalAuthTable() {
  if (tableReady) return;
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS SchoolPortalAuth (
      schoolId INTEGER PRIMARY KEY,
      codeHash TEXT NOT NULL DEFAULT '',
      enabled INTEGER NOT NULL DEFAULT 1,
      failCount INTEGER NOT NULL DEFAULT 0,
      lockedUntil DATETIME,
      lastVerifiedAt DATETIME,
      sessionVersion INTEGER NOT NULL DEFAULT 1,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  tableReady = true;
}

type AuthRow = {
  schoolId: number;
  codeHash: string;
  enabled: number;
  failCount: number;
  lockedUntil: string | null;
  lastVerifiedAt: string | null;
  sessionVersion: number;
};

export async function getPortalAuthRow(schoolId: number): Promise<AuthRow | null> {
  await ensurePortalAuthTable();
  const rows = await prisma.$queryRawUnsafe<AuthRow[]>(
    "SELECT * FROM SchoolPortalAuth WHERE schoolId = ?", schoolId,
  );
  if (!rows.length) return null;
  const r = rows[0];
  return {
    ...r,
    schoolId: Number(r.schoolId),
    enabled: Number(r.enabled),
    failCount: Number(r.failCount),
    sessionVersion: Number(r.sessionVersion),
  };
}

// 後台：產生新的 6 位數驗證碼（回傳明碼一次，僅存雜湊）
export async function generatePortalCode(schoolId: number): Promise<string> {
  await ensurePortalAuthTable();
  const code = String(randomInt(0, 1000000)).padStart(6, "0");
  const hash = await bcrypt.hash(code, 10);
  await prisma.$executeRawUnsafe(
    `INSERT INTO SchoolPortalAuth (schoolId, codeHash, enabled, failCount, lockedUntil, updatedAt)
     VALUES (?, ?, 1, 0, NULL, CURRENT_TIMESTAMP)
     ON CONFLICT(schoolId) DO UPDATE SET codeHash = excluded.codeHash, enabled = 1, failCount = 0, lockedUntil = NULL, updatedAt = CURRENT_TIMESTAMP`,
    schoolId, hash,
  );
  return code;
}

export async function disablePortalCode(schoolId: number) {
  await ensurePortalAuthTable();
  await prisma.$executeRawUnsafe(
    "UPDATE SchoolPortalAuth SET enabled = 0, updatedAt = CURRENT_TIMESTAMP WHERE schoolId = ?", schoolId,
  );
}

// 後台：登出該園所所有裝置（session 版本 +1，舊 cookie 全數失效）
export async function logoutAllDevices(schoolId: number) {
  await ensurePortalAuthTable();
  await prisma.$executeRawUnsafe(
    "UPDATE SchoolPortalAuth SET sessionVersion = sessionVersion + 1, updatedAt = CURRENT_TIMESTAMP WHERE schoolId = ?", schoolId,
  );
}

export type VerifyResult = { ok: true } | { ok: false; error: string; locked?: boolean };

export async function verifyPortalCode(schoolId: number, code: string): Promise<VerifyResult> {
  const row = await getPortalAuthRow(schoolId);
  // 統一錯誤訊息，不透露驗證碼是否存在或接近正確
  const genericError = "驗證碼錯誤，請確認後再試";
  if (!row || !row.enabled || !row.codeHash) {
    return { ok: false, error: "此園所尚未啟用驗證碼，請聯繫運動班長客服取得" };
  }
  if (row.lockedUntil && new Date(row.lockedUntil + "Z").getTime() > Date.now()) {
    return { ok: false, error: `輸入錯誤次數過多，請 ${LOCK_MINUTES} 分鐘後再試`, locked: true };
  }
  const normalized = String(code ?? "").trim();
  const valid = /^\d{6}$/.test(normalized) && await bcrypt.compare(normalized, row.codeHash);
  if (!valid) {
    const fails = row.failCount + 1;
    if (fails >= MAX_FAILS) {
      await prisma.$executeRawUnsafe(
        `UPDATE SchoolPortalAuth SET failCount = ?, lockedUntil = DATETIME(CURRENT_TIMESTAMP, '+${LOCK_MINUTES} minutes'), updatedAt = CURRENT_TIMESTAMP WHERE schoolId = ?`,
        fails, schoolId,
      );
      return { ok: false, error: `輸入錯誤次數過多，請 ${LOCK_MINUTES} 分鐘後再試`, locked: true };
    }
    await prisma.$executeRawUnsafe(
      "UPDATE SchoolPortalAuth SET failCount = ?, updatedAt = CURRENT_TIMESTAMP WHERE schoolId = ?", fails, schoolId,
    );
    return { ok: false, error: genericError };
  }
  await prisma.$executeRawUnsafe(
    "UPDATE SchoolPortalAuth SET failCount = 0, lockedUntil = NULL, lastVerifiedAt = CURRENT_TIMESTAMP, updatedAt = CURRENT_TIMESTAMP WHERE schoolId = ?",
    schoolId,
  );
  return { ok: true };
}

const secret = () => new TextEncoder().encode(createHash("sha256").update(`portal-session:${requiredAuthSecret()}`).digest("hex"));

export async function createPortalSessionCookie(schoolId: number, remember: boolean): Promise<{ name: string; value: string; options: Record<string, unknown> }> {
  const row = await getPortalAuthRow(schoolId);
  const jwt = await new SignJWT({ type: "portal-session", schoolId, sv: row?.sessionVersion ?? 1 })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(remember ? "30d" : "12h")
    .sign(secret());
  return {
    name: SESSION_COOKIE,
    value: jwt,
    options: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax" as const,
      path: "/",
      ...(remember ? { maxAge: 30 * 24 * 3600 } : {}),
    },
  };
}

// POST API 後端驗證：cookie 有效、schoolId 相符、sessionVersion 未被登出
export async function hasValidPortalSession(req: NextRequest, schoolId: number): Promise<boolean> {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, secret());
    if (payload.type !== "portal-session" || Number(payload.schoolId) !== schoolId) return false;
    const row = await getPortalAuthRow(schoolId);
    if (!row || !row.enabled) return false;
    return Number(payload.sv) === row.sessionVersion;
  } catch {
    return false;
  }
}
