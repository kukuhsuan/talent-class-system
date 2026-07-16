import { gzipSync } from "node:zlib";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createTransport } from "@/lib/mailer";
import { ensureSchoolSignatureColumns } from "@/lib/schoolSignature";

export const runtime = "nodejs";

function taipeiStamp() {
  const parts = new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const pick = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${pick("year")}-${pick("month")}-${pick("day")}_${pick("hour")}${pick("minute")}${pick("second")}`;
}

// Prisma model 已於下方個別匯出；UserAccount 用 select 排除 passwordHash 後匯出
const RAW_DUMP_EXCLUDE = new Set([
  "School", "Teacher", "Course", "Attendance", "Substitute",
  "CourseProgress", "CourseOption", "KindergartenAssessment", "UserAccount",
  "sqlite_sequence", "_prisma_migrations",
]);

/**
 * 動態匯出所有其他資料表（raw SQL 建立的表：請假、代課詢問、請款、異常、
 * 器材、審核歷程、LINE 紀錄等）。之後新增的表也會自動納入備份。
 */
async function dumpRawTables() {
  const tables = await prisma.$queryRawUnsafe<Array<{ name: string }>>(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`,
  );
  const result: Record<string, unknown[]> = {};
  for (const { name } of tables) {
    if (RAW_DUMP_EXCLUDE.has(name)) continue;
    try {
      result[name] = await prisma.$queryRawUnsafe<unknown[]>(`SELECT * FROM "${name.replace(/"/g, "")}"`);
    } catch (error) {
      result[name] = [];
      console.error(`backup dump failed for table ${name}:`, error);
    }
  }
  return result;
}

async function buildBackupPayload() {
  const [
    schools,
    teachers,
    courses,
    attendances,
    substitutes,
    courseProgress,
    courseOptions,
    assessments,
    users,
  ] = await Promise.all([
    prisma.school.findMany({ orderBy: { id: "asc" } }),
    prisma.teacher.findMany({ orderBy: { id: "asc" } }),
    prisma.course.findMany({ orderBy: { id: "asc" } }),
    prisma.attendance.findMany({ orderBy: { id: "asc" } }),
    prisma.substitute.findMany({ orderBy: { id: "asc" } }),
    prisma.courseProgress.findMany({ orderBy: [{ courseType: "asc" }, { lesson: "asc" }] }),
    prisma.courseOption.findMany({ orderBy: { id: "asc" } }),
    prisma.kindergartenAssessment.findMany({ orderBy: { id: "asc" } }),
    prisma.userAccount.findMany({
      orderBy: { id: "asc" },
      select: { id: true, username: true, name: true, role: true, isActive: true, createdAt: true, updatedAt: true },
    }),
  ]);

  // 園所簽名欄位為 raw SQL 加欄（不在 Prisma schema），需另外匯出才不會漏備份
  await ensureSchoolSignatureColumns();
  const attendanceSignatures = await prisma.$queryRawUnsafe<
    Array<{ id: number; schoolVerifierName: string; schoolSignatureData: string; schoolSignedAt: string | null }>
  >(
    `SELECT "id", "schoolVerifierName", "schoolSignatureData", "schoolSignedAt"
     FROM "Attendance" WHERE "schoolSignatureData" != '' ORDER BY "id" ASC`,
  );

  const rawTables = await dumpRawTables();
  const rawCounts = Object.fromEntries(Object.entries(rawTables).map(([name, rows]) => [name, rows.length]));

  return {
    app: "talent-class-system",
    backupVersion: 2,
    exportedAt: new Date().toISOString(),
    exportedTimezone: "Asia/Taipei",
    counts: {
      schools: schools.length,
      teachers: teachers.length,
      courses: courses.length,
      attendances: attendances.length,
      substitutes: substitutes.length,
      courseProgress: courseProgress.length,
      courseOptions: courseOptions.length,
      assessments: assessments.length,
      users: users.length,
      attendanceSignatures: attendanceSignatures.length,
      ...rawCounts,
    },
    data: {
      rawTables,
      attendanceSignatures,
      schools,
      teachers,
      courses,
      attendances,
      substitutes,
      courseProgress,
      courseOptions,
      assessments,
      users,
    },
  };
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const to = process.env.BACKUP_EMAIL || process.env.GMAIL_USER;
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD || !to) {
    return NextResponse.json(
      { error: "Backup email is not configured. Set GMAIL_USER, GMAIL_APP_PASSWORD and optional BACKUP_EMAIL." },
      { status: 500 }
    );
  }

  const stamp = taipeiStamp();
  const payload = await buildBackupPayload();
  // raw SQL 表可能回傳 BigInt，JSON.stringify 需轉換避免拋錯
  const json = JSON.stringify(payload, (_key, value) => (typeof value === "bigint" ? Number(value) : value), 2);
  const gzipped = gzipSync(Buffer.from(json, "utf8"));
  const filename = `talent-class-system-backup-${stamp}.json.gz`;

  const transporter = createTransport();
  await transporter.sendMail({
    from: `WaysLeader AI 備份 <${process.env.GMAIL_USER}>`,
    to,
    subject: `WaysLeader AI 每日備份 ${stamp}`,
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.7;">
        <h2>WaysLeader AI 每日備份</h2>
        <p>備份時間：${stamp}（Asia/Taipei）</p>
        <p>附件：${filename}</p>
        <ul>
          <li>園所：${payload.counts.schools}</li>
          <li>老師：${payload.counts.teachers}</li>
          <li>課程：${payload.counts.courses}</li>
          <li>出勤：${payload.counts.attendances}</li>
          <li>代課：${payload.counts.substitutes}</li>
          <li>學期評量：${payload.counts.assessments}</li>
          <li>園所簽名：${payload.counts.attendanceSignatures}</li>
          <li>其他資料表（請假／代課／請款／異常／歷程等）：${Object.keys(payload.data.rawTables).length} 張</li>
        </ul>
        <p>請至少保留最近 30 天備份信件。</p>
      </div>
    `,
    attachments: [
      {
        filename,
        content: gzipped,
        contentType: "application/gzip",
      },
    ],
  });

  return NextResponse.json({
    ok: true,
    sentTo: to,
    filename,
    bytes: gzipped.byteLength,
    counts: payload.counts,
  });
}
