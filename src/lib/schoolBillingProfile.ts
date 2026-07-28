import { prisma } from "@/lib/prisma";
import { ensurePortalColumns } from "@/lib/schoolPortalAccess";

export type SchoolBillingProfile = {
  schoolId: number;
  schoolName: string;
  officialName: string;
  invoiceTitle: string;
  taxId: string;
  billingEmail: string;
  submittedAt: string | null;
};

let ready = false;
export async function ensureSchoolBillingProfileTable() {
  if (ready) return;
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "SchoolBillingProfile" (
      "schoolId" INTEGER PRIMARY KEY,
      "officialName" TEXT NOT NULL DEFAULT '',
      "invoiceTitle" TEXT NOT NULL DEFAULT '',
      "taxId" TEXT NOT NULL DEFAULT '',
      "billingEmail" TEXT NOT NULL DEFAULT '',
      "submittedAt" DATETIME,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE
    )
  `);
  ready = true;
}

export async function billingProfileByToken(token: string) {
  await Promise.all([ensurePortalColumns(), ensureSchoolBillingProfileTable()]);
  const rows = await prisma.$queryRawUnsafe<SchoolBillingProfile[]>(
    `SELECT s."id" AS "schoolId", s."name" AS "schoolName",
            COALESCE(b."officialName", '') AS "officialName",
            COALESCE(b."invoiceTitle", '') AS "invoiceTitle",
            COALESCE(b."taxId", '') AS "taxId",
            COALESCE(b."billingEmail", '') AS "billingEmail",
            b."submittedAt" AS "submittedAt"
     FROM "School" s
     LEFT JOIN "SchoolBillingProfile" b ON b."schoolId" = s."id"
     WHERE s."portalCode" = ? LIMIT 1`,
    token,
  );
  return rows[0] ?? null;
}

export async function saveBillingProfile(input: Omit<SchoolBillingProfile, "schoolName" | "submittedAt">) {
  await ensureSchoolBillingProfileTable();
  await prisma.$executeRawUnsafe(
    `INSERT INTO "SchoolBillingProfile" ("schoolId", "officialName", "invoiceTitle", "taxId", "billingEmail", "submittedAt")
     VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT("schoolId") DO UPDATE SET
       "officialName" = excluded."officialName", "invoiceTitle" = excluded."invoiceTitle",
       "taxId" = excluded."taxId", "billingEmail" = excluded."billingEmail",
       "submittedAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP`,
    input.schoolId, input.officialName, input.invoiceTitle, input.taxId, input.billingEmail,
  );
}
