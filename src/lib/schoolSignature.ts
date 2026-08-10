import { prisma } from "@/lib/prisma";

let signatureColumnsReady = false;

/** 幼兒園與安親班可用現場電子簽名取代臨時缺少的紙本點名表。 */
export function supportsSchoolSignature(department: string | null | undefined) {
  const value = String(department ?? "");
  return value.includes("幼兒園") || value.includes("安親");
}

export function requiresSchoolSignature(_department: string | null | undefined, _teacherName?: string | null) {
  // 電子簽名是沒有紙本點名表時的備用方案，不強迫每堂課簽名。
  void _department;
  void _teacherName;
  return false;
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
