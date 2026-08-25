import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { buildSchoolInvoicePreview } from "@/lib/schoolInvoices";

export type VerificationLesson = {
  attendanceId: number | null;
  courseName: string;
  date: string;
  weekday: string;
  time: string;
  studentCount: number | null;
};

export type VerificationSnapshot = {
  schoolId: number;
  schoolName: string;
  year: number;
  months: number[];
  lessons: VerificationLesson[];
  classCount: number;
  totalStudentCount: number;
};

export type VerificationRow = {
  id: number;
  schoolId: number;
  year: number;
  months: string;
  tokenHash: string;
  snapshotHash: string;
  snapshotJson: string;
  status: string;
  confirmerName: string;
  confirmerNote: string;
  confirmedAt: string | null;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
};

export type SchoolAttendanceVerificationSummaryItem = {
  schoolId: number;
  schoolName: string;
  status: "not_created" | "pending" | "confirmed" | "issue" | "stale";
  confirmerName: string;
  confirmerNote: string;
  confirmedAt: string | null;
  classCount: number;
};

let storageReady = false;

export async function ensureSchoolAttendanceVerificationStorage() {
  if (storageReady) return;
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "SchoolAttendanceVerification" (
      "id" INTEGER PRIMARY KEY AUTOINCREMENT,
      "schoolId" INTEGER NOT NULL,
      "year" INTEGER NOT NULL,
      "months" TEXT NOT NULL,
      "tokenHash" TEXT NOT NULL UNIQUE,
      "snapshotHash" TEXT NOT NULL,
      "snapshotJson" TEXT NOT NULL,
      "status" TEXT NOT NULL DEFAULT 'pending',
      "confirmerName" TEXT NOT NULL DEFAULT '',
      "confirmerNote" TEXT NOT NULL DEFAULT '',
      "confirmedAt" DATETIME,
      "expiresAt" DATETIME NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "SchoolAttendanceVerification_scope_idx" ON "SchoolAttendanceVerification"("schoolId", "year", "months")');
  storageReady = true;
}

export function normalizeVerificationMonths(value: unknown) {
  const raw = Array.isArray(value) ? value : String(value ?? "").split(",");
  const months = [...new Set(raw.map(Number).filter((month) => Number.isInteger(month) && month >= 1 && month <= 12))].sort((a, b) => a - b);
  if (!months.length) throw new Error("請至少選擇一個核對月份");
  return months;
}

function tokenDigest(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function snapshotDigest(snapshot: VerificationSnapshot) {
  return crypto.createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
}

export async function buildVerificationSnapshot(input: { schoolId: number; year: number; months: number[] }) {
  const months = normalizeVerificationMonths(input.months);
  const preview = await buildSchoolInvoicePreview({
    schoolId: input.schoolId,
    year: input.year,
    month: months[0],
    months,
  });
  const lessons = preview.items.flatMap((item) => item.details.map((detail) => ({
    attendanceId: detail.attendanceId,
    courseName: item.courseName,
    date: detail.date,
    weekday: detail.weekday,
    time: detail.time,
    studentCount: detail.studentCount,
  }))).sort((a, b) => `${a.date}-${a.time}-${a.attendanceId ?? 0}`.localeCompare(`${b.date}-${b.time}-${b.attendanceId ?? 0}`));
  const snapshot: VerificationSnapshot = {
    schoolId: preview.schoolId,
    schoolName: preview.schoolName,
    year: input.year,
    months,
    lessons,
    classCount: lessons.length,
    totalStudentCount: lessons.reduce((sum, lesson) => sum + (Number(lesson.studentCount) || 0), 0),
  };
  return { snapshot, hash: snapshotDigest(snapshot) };
}

function parseSnapshot(row: VerificationRow) {
  return JSON.parse(row.snapshotJson) as VerificationSnapshot;
}

export async function createSchoolAttendanceVerification(input: { schoolId: number; year: number; months: number[] }) {
  await ensureSchoolAttendanceVerificationStorage();
  const months = normalizeVerificationMonths(input.months);
  const { snapshot, hash } = await buildVerificationSnapshot({ ...input, months });
  if (!snapshot.lessons.length) throw new Error("所選月份沒有可供核對的課程人數");
  const token = crypto.randomBytes(32).toString("base64url");
  const tokenHash = tokenDigest(token);
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const monthsKey = JSON.stringify(months);
  await prisma.$executeRaw`
    INSERT INTO "SchoolAttendanceVerification"
      ("schoolId", "year", "months", "tokenHash", "snapshotHash", "snapshotJson", "status", "expiresAt")
    VALUES
      (${input.schoolId}, ${input.year}, ${monthsKey}, ${tokenHash}, ${hash}, ${JSON.stringify(snapshot)}, 'pending', ${expiresAt})
  `;
  const rows = await prisma.$queryRaw<VerificationRow[]>`SELECT * FROM "SchoolAttendanceVerification" WHERE "tokenHash" = ${tokenHash} LIMIT 1`;
  return { row: rows[0], token, snapshot };
}

export async function verificationByToken(token: string) {
  await ensureSchoolAttendanceVerificationStorage();
  if (!token || token.length < 20) throw new Error("核對連結無效");
  const rows = await prisma.$queryRaw<VerificationRow[]>`SELECT * FROM "SchoolAttendanceVerification" WHERE "tokenHash" = ${tokenDigest(token)} LIMIT 1`;
  const row = rows[0];
  if (!row || new Date(row.expiresAt).getTime() < Date.now()) throw new Error("核對連結已失效，請聯繫客服重新產生");
  const months = normalizeVerificationMonths(JSON.parse(row.months));
  const current = await buildVerificationSnapshot({ schoolId: row.schoolId, year: row.year, months });
  return {
    row,
    storedSnapshot: parseSnapshot(row),
    currentSnapshot: current.snapshot,
    currentHash: current.hash,
    stale: row.snapshotHash !== current.hash,
  };
}

export async function submitSchoolAttendanceVerification(token: string, input: { action: string; confirmerName: string; note?: string; snapshotHash: string }) {
  const context = await verificationByToken(token);
  const name = input.confirmerName.trim().slice(0, 80);
  const note = String(input.note ?? "").trim().slice(0, 1000);
  if (!name) throw new Error("請填寫確認人姓名或職稱");
  if (input.snapshotHash !== context.currentHash) throw new Error("課程人數剛剛有更新，請重新整理後再確認");
  const status = input.action === "issue" ? "issue" : "confirmed";
  if (status === "issue" && !note) throw new Error("請簡單說明哪一筆人數需要修改");
  const confirmedAt = new Date().toISOString();
  await prisma.$executeRaw`
    UPDATE "SchoolAttendanceVerification"
    SET "snapshotHash" = ${context.currentHash}, "snapshotJson" = ${JSON.stringify(context.currentSnapshot)},
        "status" = ${status}, "confirmerName" = ${name}, "confirmerNote" = ${note},
        "confirmedAt" = ${confirmedAt}, "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = ${context.row.id}
  `;
  return { status, confirmerName: name, note, confirmedAt };
}

export async function latestSchoolAttendanceVerification(input: { schoolId: number; year: number; months: number[] }) {
  await ensureSchoolAttendanceVerificationStorage();
  const months = normalizeVerificationMonths(input.months);
  const monthsKey = JSON.stringify(months);
  const rows = await prisma.$queryRaw<VerificationRow[]>`
    SELECT * FROM "SchoolAttendanceVerification"
    WHERE "schoolId" = ${input.schoolId} AND "year" = ${input.year} AND "months" = ${monthsKey}
    ORDER BY "id" DESC LIMIT 1
  `;
  const row = rows[0];
  if (!row) return null;
  const current = await buildVerificationSnapshot({ ...input, months });
  return {
    id: row.id,
    status: row.status,
    confirmerName: row.confirmerName,
    confirmerNote: row.confirmerNote,
    confirmedAt: row.confirmedAt,
    expiresAt: row.expiresAt,
    stale: row.snapshotHash !== current.hash,
  };
}

function attendanceStudentCount(row: { studentCount: number | null; studentCountA: number | null; studentCountB: number | null }) {
  if (row.studentCount !== null) return row.studentCount;
  if (row.studentCountA !== null && row.studentCountB !== null) return row.studentCountA + row.studentCountB;
  return row.studentCountA ?? row.studentCountB ?? null;
}

export async function schoolAttendanceVerificationSummary(input: { year: number; months: number[] }) {
  await ensureSchoolAttendanceVerificationStorage();
  const months = normalizeVerificationMonths(input.months);
  const monthsKey = JSON.stringify(months);
  const ranges = months.map((month) => ({
    start: new Date(Date.UTC(input.year, month - 1, 1)),
    end: new Date(Date.UTC(input.year, month, 1)),
  }));

  const attendances = await prisma.attendance.findMany({
    where: {
      OR: ranges.map(({ start, end }) => ({ date: { gte: start, lt: end } })),
      cancelled: false,
      course: { schoolId: { not: null } },
    },
    select: {
      id: true,
      studentCount: true,
      studentCountA: true,
      studentCountB: true,
      category: true,
      course: {
        select: {
          schoolId: true,
          category: true,
          department: true,
          schoolRel: { select: { id: true, name: true, type: true } },
        },
      },
    },
  });

  const schools = new Map<number, { schoolName: string; lessons: Map<number, number | null> }>();
  for (const attendance of attendances) {
    const school = attendance.course.schoolRel;
    if (!school) continue;
    const isAfterSchool = attendance.course.department === "安親班" || school.type === "安親班" || school.type.includes("安親");
    const isDemo = String(attendance.category || attendance.course.category).toLowerCase() === "demo";
    if (!isAfterSchool || isDemo) continue;
    const entry = schools.get(school.id) ?? { schoolName: school.name, lessons: new Map<number, number | null>() };
    entry.lessons.set(attendance.id, attendanceStudentCount(attendance));
    schools.set(school.id, entry);
  }

  const rows = await prisma.$queryRaw<VerificationRow[]>`
    SELECT verification.*
    FROM "SchoolAttendanceVerification" verification
    INNER JOIN (
      SELECT "schoolId", MAX("id") AS "latestId"
      FROM "SchoolAttendanceVerification"
      WHERE "year" = ${input.year} AND "months" = ${monthsKey}
      GROUP BY "schoolId"
    ) latest ON latest."latestId" = verification."id"
  `;
  const latestBySchool = new Map(rows.map((row) => [row.schoolId, row]));

  const items: SchoolAttendanceVerificationSummaryItem[] = [...schools.entries()].map(([schoolId, school]) => {
    const row = latestBySchool.get(schoolId);
    if (!row) {
      return { schoolId, schoolName: school.schoolName, status: "not_created", confirmerName: "", confirmerNote: "", confirmedAt: null, classCount: school.lessons.size };
    }
    const stored = parseSnapshot(row);
    const storedLessons = new Map(stored.lessons.map((lesson) => [lesson.attendanceId, lesson.studentCount]));
    const stale = storedLessons.size !== school.lessons.size
      || [...school.lessons].some(([attendanceId, count]) => storedLessons.get(attendanceId) !== count);
    return {
      schoolId,
      schoolName: school.schoolName,
      status: stale ? "stale" : row.status === "confirmed" ? "confirmed" : row.status === "issue" ? "issue" : "pending",
      confirmerName: row.confirmerName,
      confirmerNote: row.confirmerNote,
      confirmedAt: row.confirmedAt,
      classCount: school.lessons.size,
    };
  });
  const priority = { issue: 0, stale: 1, pending: 2, not_created: 3, confirmed: 4 } as const;
  items.sort((a, b) => priority[a.status] - priority[b.status] || a.schoolName.localeCompare(b.schoolName, "zh-Hant"));
  return {
    year: input.year,
    months,
    counts: {
      total: items.length,
      notCreated: items.filter((item) => item.status === "not_created").length,
      pending: items.filter((item) => item.status === "pending").length,
      confirmed: items.filter((item) => item.status === "confirmed").length,
      issue: items.filter((item) => item.status === "issue").length,
      stale: items.filter((item) => item.status === "stale").length,
    },
    items,
  };
}
