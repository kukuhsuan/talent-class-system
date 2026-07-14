import { prisma } from "@/lib/prisma";

let signatureColumnsReady = false;
// 目前改採每月紙本核對表，手機端簽名暫停顯示；保留既有資料與程式以便日後恢復。
const MOBILE_SCHOOL_SIGNATURE_ENABLED = false;

export function requiresSchoolSignature(department: string | null | undefined) {
  return MOBILE_SCHOOL_SIGNATURE_ENABLED && String(department ?? "").includes("安親");
}

export async function ensureSchoolSignatureColumns() {
  if (signatureColumnsReady) return;
  const statements = [
    'ALTER TABLE "Attendance" ADD COLUMN "schoolVerifierName" TEXT NOT NULL DEFAULT ""',
    'ALTER TABLE "Attendance" ADD COLUMN "schoolSignatureData" TEXT NOT NULL DEFAULT ""',
    'ALTER TABLE "Attendance" ADD COLUMN "schoolSignedAt" DATETIME',
  ];
  for (const statement of statements) {
    await prisma.$executeRawUnsafe(statement).catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      if (!/already exists|duplicate column/i.test(message)) throw error;
    });
  }
  signatureColumnsReady = true;
}

export function validSignatureData(value: unknown) {
  const data = String(value ?? "");
  return /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(data) && data.length <= 160_000;
}

export type SchoolSignatureRow = {
  attendanceId: number;
  schoolVerifierName: string;
  schoolSignatureData: string;
  schoolSignedAt: string | Date | null;
};

export async function schoolSignatureMap(attendanceIds: number[]) {
  await ensureSchoolSignatureColumns();
  if (attendanceIds.length === 0) return new Map<number, SchoolSignatureRow>();
  const placeholders = attendanceIds.map(() => "?").join(",");
  const rows = await prisma.$queryRawUnsafe<SchoolSignatureRow[]>(
    `SELECT "id" AS "attendanceId", "schoolVerifierName", "schoolSignatureData", "schoolSignedAt"
     FROM "Attendance" WHERE "id" IN (${placeholders})`,
    ...attendanceIds,
  );
  return new Map(rows.map((row) => [Number(row.attendanceId), row]));
}

export async function saveSchoolSignature(attendanceId: number, verifierName: string, signatureData: string) {
  await ensureSchoolSignatureColumns();
  await prisma.$executeRawUnsafe(
    `UPDATE "Attendance"
     SET "schoolVerifierName" = ?, "schoolSignatureData" = ?, "schoolSignedAt" = CURRENT_TIMESTAMP
     WHERE "id" = ?`,
    verifierName,
    signatureData,
    attendanceId,
  );
}
