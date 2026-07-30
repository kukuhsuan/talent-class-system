import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureSchoolBillingProfileTable } from "@/lib/schoolBillingProfile";
import { OWNER_ROLES, requireRole } from "@/lib/permissions";

type ImportRow = {
  sourceName?: unknown;
  invoiceTitle?: unknown;
  taxId?: unknown;
  billingEmail?: unknown;
};

function text(value: unknown) {
  return String(value ?? "").trim();
}

function normalizedName(value: unknown) {
  return text(value)
    .normalize("NFKC")
    .replaceAll("臺", "台")
    .replace(/[（）()]/g, "")
    .replace(/[^\p{L}\p{N}]/gu, "")
    .toLowerCase();
}

function relaxedName(value: unknown) {
  return normalizedName(value)
    .replace(/優比熊|優$/, "")
    .replace(/足$/, "")
    .replace(/幼校/g, "幼兒園");
}

function validTaxId(value: unknown) {
  const result = text(value).replace(/\D/g, "");
  return /^\d{8}$/.test(result) ? result : "";
}

function validEmail(value: unknown) {
  const result = text(value);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result) ? result : "";
}

export async function POST(req: NextRequest) {
  const auth = await requireRole(OWNER_ROLES);
  if (auth.response) return auth.response;

  const body = await req.json();
  const apply = body.apply === true;
  const rows = Array.isArray(body.rows) ? body.rows as ImportRow[] : [];
  if (rows.length === 0 || rows.length > 500) {
    return NextResponse.json({ error: "匯入資料筆數不正確" }, { status: 400 });
  }

  await ensureSchoolBillingProfileTable();
  const schools = await prisma.school.findMany({
    select: { id: true, name: true },
    orderBy: { id: "asc" },
  });

  const exact = new Map<string, typeof schools>();
  const relaxed = new Map<string, typeof schools>();
  for (const school of schools) {
    const exactKey = normalizedName(school.name);
    const relaxedKey = relaxedName(school.name);
    exact.set(exactKey, [...(exact.get(exactKey) ?? []), school]);
    relaxed.set(relaxedKey, [...(relaxed.get(relaxedKey) ?? []), school]);
  }

  const matched: Array<{
    schoolId: number;
    schoolName: string;
    sourceName: string;
    invoiceTitle: string;
    taxId: string;
    billingEmail: string;
  }> = [];
  const unmatched: Array<{ sourceName: string; candidates: string[] }> = [];
  const ambiguous: Array<{ sourceName: string; candidates: string[] }> = [];

  for (const row of rows) {
    const sourceName = text(row.sourceName);
    if (!sourceName) continue;
    const exactCandidates = exact.get(normalizedName(sourceName)) ?? [];
    const candidates = exactCandidates.length > 0
      ? exactCandidates
      : relaxed.get(relaxedName(sourceName)) ?? [];

    if (candidates.length === 1) {
      matched.push({
        schoolId: candidates[0].id,
        schoolName: candidates[0].name,
        sourceName,
        invoiceTitle: text(row.invoiceTitle),
        taxId: validTaxId(row.taxId),
        billingEmail: validEmail(row.billingEmail),
      });
      continue;
    }

    const includes = schools
      .filter((school) => {
        const a = relaxedName(school.name);
        const b = relaxedName(sourceName);
        return a.length >= 4 && b.length >= 4 && (a.includes(b) || b.includes(a));
      })
      .slice(0, 5)
      .map((school) => school.name);

    const issue = { sourceName, candidates: candidates.length > 0 ? candidates.map((school) => school.name) : includes };
    if (candidates.length > 1) ambiguous.push(issue);
    else unmatched.push(issue);
  }

  const uniqueMatched = [...new Map(matched.map((row) => [row.schoolId, row])).values()];
  let applied = 0;
  if (apply) {
    for (const row of uniqueMatched) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO "SchoolBillingProfile"
          ("schoolId", "officialName", "invoiceTitle", "taxId", "billingEmail", "submittedAt")
         VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT("schoolId") DO UPDATE SET
          "officialName" = CASE WHEN excluded."officialName" != '' THEN excluded."officialName" ELSE "SchoolBillingProfile"."officialName" END,
          "invoiceTitle" = CASE WHEN excluded."invoiceTitle" != '' THEN excluded."invoiceTitle" ELSE "SchoolBillingProfile"."invoiceTitle" END,
          "taxId" = CASE WHEN excluded."taxId" != '' THEN excluded."taxId" ELSE "SchoolBillingProfile"."taxId" END,
          "billingEmail" = CASE WHEN excluded."billingEmail" != '' THEN excluded."billingEmail" ELSE "SchoolBillingProfile"."billingEmail" END,
          "submittedAt" = CURRENT_TIMESTAMP,
          "updatedAt" = CURRENT_TIMESTAMP`,
        row.schoolId,
        row.sourceName,
        row.invoiceTitle,
        row.taxId,
        row.billingEmail,
      );
      applied += 1;
    }
  }

  return NextResponse.json({
    applied,
    matched: uniqueMatched,
    unmatched,
    ambiguous,
    summary: {
      sourceRows: rows.length,
      matched: uniqueMatched.length,
      unmatched: unmatched.length,
      ambiguous: ambiguous.length,
    },
  });
}
