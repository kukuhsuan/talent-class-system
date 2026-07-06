import { prisma } from "@/lib/prisma";
import { verifySchoolPortalToken } from "@/lib/schoolPortalToken";

// 園所端連結支援兩種格式：
// 1. 短碼（新版，8 碼英數）：/school-portal/abcd2345
// 2. JWT（舊版長連結）：驗簽 + 比對 portalTokenVersion
// 「重生連結」會同時換掉短碼並讓舊 JWT 失效。

let columnsReady = false;
export async function ensurePortalColumns() {
  if (columnsReady) return;
  await prisma.$executeRawUnsafe('ALTER TABLE School ADD COLUMN portalTokenVersion INTEGER NOT NULL DEFAULT 1').catch(() => undefined);
  await prisma.$executeRawUnsafe('ALTER TABLE School ADD COLUMN portalCode TEXT').catch(() => undefined);
  columnsReady = true;
}

// 避開容易混淆的 0/O、1/l/I
const CODE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

function randomPortalCode(length = 8) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const byte of bytes) out += CODE_ALPHABET[byte % CODE_ALPHABET.length];
  return out;
}

export async function getOrCreatePortalCode(schoolId: number) {
  await ensurePortalColumns();
  const rows = await prisma.$queryRawUnsafe<Array<{ portalCode: string | null }>>(
    "SELECT portalCode FROM School WHERE id = ?",
    schoolId,
  );
  const existing = String(rows[0]?.portalCode ?? "").trim();
  if (existing) return existing;
  return rotatePortalCode(schoolId);
}

export async function rotatePortalCode(schoolId: number) {
  await ensurePortalColumns();
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomPortalCode();
    const duplicated = await prisma.$queryRawUnsafe<Array<{ id: number }>>(
      "SELECT id FROM School WHERE portalCode = ? LIMIT 1",
      code,
    );
    if (duplicated.length > 0) continue;
    await prisma.$executeRawUnsafe("UPDATE School SET portalCode = ? WHERE id = ?", code, schoolId);
    return code;
  }
  throw new Error("無法產生園所短碼，請再試一次");
}

export async function resolveSchoolPortalParam(raw: string): Promise<{ schoolId: number }> {
  const param = decodeURIComponent(raw).trim();
  if (!param) throw new Error("Invalid school portal token");
  await ensurePortalColumns();

  // 短碼：不含 "."，直接查 School.portalCode
  if (!param.includes(".")) {
    const rows = await prisma.$queryRawUnsafe<Array<{ id: number }>>(
      "SELECT id FROM School WHERE portalCode = ? LIMIT 1",
      param,
    );
    if (rows.length === 0) throw new Error("Invalid school portal code");
    return { schoolId: Number(rows[0].id) };
  }

  // 舊版 JWT：驗簽 + tokenVersion
  const verified = await verifySchoolPortalToken(param);
  const rows = await prisma.$queryRawUnsafe<Array<{ portalTokenVersion: number }>>(
    "SELECT portalTokenVersion FROM School WHERE id = ?",
    verified.schoolId,
  );
  if (Number(rows[0]?.portalTokenVersion ?? 0) !== verified.tokenVersion) {
    throw new Error("Invalid school portal token");
  }
  return { schoolId: verified.schoolId };
}
