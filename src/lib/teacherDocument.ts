import { prisma } from "@/lib/prisma";

// 教師敏感文件：存摺封面（bankbook）與委任書（mandate）。
// 履歷「不」走這裡——履歷維持既有線上表單 TeacherResume，見 docs/teacher-accounting-plan.md 0-1。
export const TEACHER_DOC_TYPES = ["bankbook", "mandate"] as const;
export type TeacherDocType = (typeof TEACHER_DOC_TYPES)[number];

export const TEACHER_DOC_LABELS: Record<TeacherDocType, string> = {
  bankbook: "存摺封面",
  mandate: "委任書",
};

// 存摺只有「待審核 → 已完成」；委任書多一段「行政已確認」再由會計複審。
export const DOC_STATUS = {
  none: "未上傳",
  pending: "待審核",
  adminOk: "行政已確認",
  done: "已完成",
  reject: "需補件",
} as const;

export type TeacherDocumentRow = {
  id: number;
  teacherId: number;
  docType: TeacherDocType;
  fileName: string;
  fileSize: number;
  contentType: string;
  uploadedAt: string;
  uploadedBy: string;
  reviewStatus: string;
  reviewedBy: string;
  reviewedAt: string;
  notes: string;
  // 原檔已依保留期限刪除的時間；審核紀錄本身保留，不影響發薪判斷
  filePurgedAt: string;
};

// fileUrl 只在後端流通，絕不放進回給前端的型別裡
type RawRow = TeacherDocumentRow & { fileUrl: string };

let tableReady = false;

export function isTeacherDocType(value: unknown): value is TeacherDocType {
  return TEACHER_DOC_TYPES.includes(String(value ?? "") as TeacherDocType);
}

export async function ensureTeacherDocumentTable() {
  if (tableReady) return;
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS TeacherDocument (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      teacherId INTEGER NOT NULL,
      docType TEXT NOT NULL,
      fileUrl TEXT NOT NULL DEFAULT '',
      fileName TEXT NOT NULL DEFAULT '',
      fileSize INTEGER NOT NULL DEFAULT 0,
      contentType TEXT NOT NULL DEFAULT '',
      uploadedAt DATETIME,
      uploadedBy TEXT NOT NULL DEFAULT '',
      reviewStatus TEXT NOT NULL DEFAULT '未上傳',
      reviewedBy TEXT NOT NULL DEFAULT '',
      reviewedAt DATETIME,
      notes TEXT NOT NULL DEFAULT '',
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await prisma.$executeRawUnsafe(
    "CREATE UNIQUE INDEX IF NOT EXISTS TeacherDocument_teacher_type_idx ON TeacherDocument(teacherId, docType)",
  );
  await prisma.$executeRawUnsafe(
    "CREATE INDEX IF NOT EXISTS TeacherDocument_reviewStatus_idx ON TeacherDocument(reviewStatus)",
  );
  // 已存在的資料表不會被上面的 CREATE IF NOT EXISTS 補欄位，要另外 ALTER
  const columns = await prisma.$queryRawUnsafe<Array<{ name: string }>>('PRAGMA table_info("TeacherDocument")');
  if (!columns.some((column) => column.name === "filePurgedAt")) {
    await prisma
      .$executeRawUnsafe('ALTER TABLE TeacherDocument ADD COLUMN filePurgedAt DATETIME')
      .catch(() => undefined);
  }
  tableReady = true;
}

function mapRow(row: RawRow): TeacherDocumentRow {
  return {
    id: Number(row.id),
    teacherId: Number(row.teacherId),
    docType: row.docType as TeacherDocType,
    fileName: row.fileName || "",
    fileSize: Number(row.fileSize ?? 0),
    contentType: row.contentType || "",
    uploadedAt: String(row.uploadedAt ?? ""),
    uploadedBy: row.uploadedBy || "",
    reviewStatus: row.reviewStatus || DOC_STATUS.none,
    reviewedBy: row.reviewedBy || "",
    reviewedAt: String(row.reviewedAt ?? ""),
    notes: row.notes || "",
    filePurgedAt: String(row.filePurgedAt ?? ""),
  };
}

const PUBLIC_COLUMNS =
  "id, teacherId, docType, fileName, fileSize, contentType, uploadedAt, uploadedBy, reviewStatus, reviewedBy, reviewedAt, notes, filePurgedAt";

export async function listTeacherDocuments(teacherIds?: number[]) {
  await ensureTeacherDocumentTable();
  if (teacherIds && teacherIds.length === 0) return [];
  const rows = teacherIds
    ? await prisma.$queryRawUnsafe<RawRow[]>(
        `SELECT ${PUBLIC_COLUMNS} FROM TeacherDocument WHERE teacherId IN (${teacherIds.map(() => "?").join(",")})`,
        ...teacherIds.map(Number),
      )
    : await prisma.$queryRawUnsafe<RawRow[]>(`SELECT ${PUBLIC_COLUMNS} FROM TeacherDocument`);
  return rows.map(mapRow);
}

export async function getTeacherDocument(teacherId: number, docType: TeacherDocType) {
  await ensureTeacherDocumentTable();
  const rows = await prisma.$queryRawUnsafe<RawRow[]>(
    `SELECT ${PUBLIC_COLUMNS} FROM TeacherDocument WHERE teacherId = ? AND docType = ? LIMIT 1`,
    Number(teacherId),
    docType,
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

// 只有檔案串流端點會用到，回傳含 fileUrl 的完整列
export async function getTeacherDocumentWithUrl(id: number) {
  await ensureTeacherDocumentTable();
  const rows = await prisma.$queryRawUnsafe<RawRow[]>(
    "SELECT * FROM TeacherDocument WHERE id = ? LIMIT 1",
    Number(id),
  );
  const row = rows[0];
  return row ? { ...mapRow(row), fileUrl: row.fileUrl || "" } : null;
}

export async function upsertTeacherDocument(input: {
  teacherId: number;
  docType: TeacherDocType;
  fileUrl: string;
  fileName: string;
  fileSize: number;
  contentType: string;
  uploadedBy: string;
}) {
  await ensureTeacherDocumentTable();
  // 先記下舊檔路徑，寫入後由呼叫端刪掉，否則 blob 會一直累積沒人管的孤兒存摺
  const previousRows = await prisma.$queryRawUnsafe<Array<{ fileUrl: string }>>(
    "SELECT fileUrl FROM TeacherDocument WHERE teacherId = ? AND docType = ? LIMIT 1",
    Number(input.teacherId),
    input.docType,
  );
  const previousFileUrl = previousRows[0]?.fileUrl || "";
  // 重新上傳一律回到「待審核」，並清掉上一次的審核結果與需補件原因，
  // 否則舊的「已完成」會蓋在新檔案上，等於沒審就過。
  await prisma.$executeRawUnsafe(
    `INSERT INTO TeacherDocument
       (teacherId, docType, fileUrl, fileName, fileSize, contentType, uploadedAt, uploadedBy, reviewStatus, reviewedBy, reviewedAt, notes, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?, '', NULL, '', CURRENT_TIMESTAMP)
     ON CONFLICT(teacherId, docType) DO UPDATE SET
       fileUrl = excluded.fileUrl,
       fileName = excluded.fileName,
       fileSize = excluded.fileSize,
       contentType = excluded.contentType,
       uploadedAt = CURRENT_TIMESTAMP,
       uploadedBy = excluded.uploadedBy,
       reviewStatus = excluded.reviewStatus,
       reviewedBy = '',
       reviewedAt = NULL,
       notes = '',
       updatedAt = CURRENT_TIMESTAMP`,
    Number(input.teacherId),
    input.docType,
    input.fileUrl,
    input.fileName,
    Number(input.fileSize) || 0,
    input.contentType,
    input.uploadedBy,
    DOC_STATUS.pending,
  );
  const row = await getTeacherDocument(input.teacherId, input.docType);
  // 新舊路徑相同時不刪，否則會把剛寫進去的檔案砍掉
  return { row, previousFileUrl: previousFileUrl === input.fileUrl ? "" : previousFileUrl };
}

export async function reviewTeacherDocument(id: number, reviewStatus: string, reviewedBy: string, notes: string) {
  await ensureTeacherDocumentTable();
  await prisma.$executeRawUnsafe(
    `UPDATE TeacherDocument
        SET reviewStatus = ?, reviewedBy = ?, reviewedAt = CURRENT_TIMESTAMP, notes = ?, updatedAt = CURRENT_TIMESTAMP
      WHERE id = ?`,
    reviewStatus,
    reviewedBy,
    notes,
    Number(id),
  );
  // 一律回不含 fileUrl 的版本，審核端點不需要也不應該拿到原檔路徑
  const rows = await prisma.$queryRawUnsafe<RawRow[]>(
    `SELECT ${PUBLIC_COLUMNS} FROM TeacherDocument WHERE id = ? LIMIT 1`,
    Number(id),
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

// 保留期限到期的名單：已審核完成、超過 N 天、原檔還在的才需要清。
// 只刪檔案不刪列——審核紀錄要留著，否則發薪判斷會突然變成「未上傳」。
export async function listDocumentsToPurge(retentionDays: number) {
  await ensureTeacherDocumentTable();
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();
  return prisma.$queryRawUnsafe<Array<{ id: number; teacherId: number; docType: string; fileUrl: string; reviewedAt: string }>>(
    `SELECT id, teacherId, docType, fileUrl, reviewedAt
       FROM TeacherDocument
      WHERE reviewStatus = ? AND fileUrl <> '' AND reviewedAt IS NOT NULL AND reviewedAt <= ?
      ORDER BY reviewedAt ASC
      LIMIT 200`,
    DOC_STATUS.done,
    cutoff,
  );
}

export async function markDocumentPurged(id: number) {
  await ensureTeacherDocumentTable();
  await prisma.$executeRawUnsafe(
    `UPDATE TeacherDocument
        SET fileUrl = '', filePurgedAt = CURRENT_TIMESTAMP, updatedAt = CURRENT_TIMESTAMP
      WHERE id = ?`,
    Number(id),
  );
}

// 發薪前提醒只在意「存摺是否已審核通過」，未上傳時回未上傳
export function bankbookStatusOf(documents: TeacherDocumentRow[], teacherId: number) {
  const row = documents.find((doc) => doc.teacherId === teacherId && doc.docType === "bankbook");
  return row?.reviewStatus || DOC_STATUS.none;
}
