import { prisma } from "@/lib/prisma";

export const EQUIPMENT_STATUS_OPTIONS = ["正常", "需補充", "損壞", "遺失"] as const;
export type EquipmentStatusValue = (typeof EQUIPMENT_STATUS_OPTIONS)[number];

export type EquipmentStatusRow = {
  id: number;
  schoolId: number | null;
  school: string;
  name: string;
  quantity: string;
  status: EquipmentStatusValue;
  imageUrl: string;
  notes: string;
  sortOrder: number;
  isActive: boolean;
};

type RawEquipmentStatusRow = EquipmentStatusRow & { isActive: boolean | number };

export async function ensureEquipmentStatusTable() {
  await prisma.$executeRawUnsafe(
    'CREATE TABLE IF NOT EXISTS EquipmentStatus (id INTEGER PRIMARY KEY AUTOINCREMENT, schoolId INTEGER, school TEXT NOT NULL DEFAULT "", name TEXT NOT NULL, quantity TEXT NOT NULL DEFAULT "", status TEXT NOT NULL DEFAULT "正常", imageUrl TEXT NOT NULL DEFAULT "", notes TEXT NOT NULL DEFAULT "", sortOrder INTEGER NOT NULL DEFAULT 0, isActive BOOLEAN NOT NULL DEFAULT 1, createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)'
  );
  await prisma.$executeRawUnsafe('ALTER TABLE EquipmentStatus ADD COLUMN imageUrl TEXT NOT NULL DEFAULT ""').catch(() => undefined);
  await prisma.$executeRawUnsafe("CREATE INDEX IF NOT EXISTS EquipmentStatus_schoolId_idx ON EquipmentStatus(schoolId)");
  await prisma.$executeRawUnsafe("CREATE INDEX IF NOT EXISTS EquipmentStatus_school_idx ON EquipmentStatus(school)");
}

export function normalizeEquipmentStatus(value: unknown): EquipmentStatusValue {
  const text = String(value ?? "").trim();
  return EQUIPMENT_STATUS_OPTIONS.includes(text as EquipmentStatusValue) ? text as EquipmentStatusValue : "正常";
}

function mapEquipmentStatus(row: RawEquipmentStatusRow): EquipmentStatusRow {
  return {
    id: Number(row.id),
    schoolId: row.schoolId == null ? null : Number(row.schoolId),
    school: row.school ?? "",
    name: row.name ?? "",
    quantity: row.quantity ?? "",
    status: normalizeEquipmentStatus(row.status),
    imageUrl: row.imageUrl ?? "",
    notes: row.notes ?? "",
    sortOrder: Number(row.sortOrder ?? 0),
    isActive: row.isActive === true || Number(row.isActive) === 1,
  };
}

export async function listEquipmentStatuses(opts: { schoolId?: number | null; school?: string; activeOnly?: boolean } = {}) {
  await ensureEquipmentStatusTable();
  const activeSql = opts.activeOnly === false ? "1 = 1" : "isActive = 1";
  const school = String(opts.school ?? "").trim();
  const schoolId = opts.schoolId ? Number(opts.schoolId) : 0;
  let rows: RawEquipmentStatusRow[];

  if (schoolId && school) {
    rows = await prisma.$queryRawUnsafe(
      `SELECT id, schoolId, school, name, quantity, status, imageUrl, notes, sortOrder, isActive FROM EquipmentStatus WHERE ${activeSql} AND (schoolId = ? OR school = ?) ORDER BY sortOrder ASC, id ASC`,
      schoolId,
      school
    ) as RawEquipmentStatusRow[];
  } else if (schoolId) {
    rows = await prisma.$queryRawUnsafe(
      `SELECT id, schoolId, school, name, quantity, status, imageUrl, notes, sortOrder, isActive FROM EquipmentStatus WHERE ${activeSql} AND schoolId = ? ORDER BY sortOrder ASC, id ASC`,
      schoolId
    ) as RawEquipmentStatusRow[];
  } else if (school) {
    rows = await prisma.$queryRawUnsafe(
      `SELECT id, schoolId, school, name, quantity, status, imageUrl, notes, sortOrder, isActive FROM EquipmentStatus WHERE ${activeSql} AND school = ? ORDER BY sortOrder ASC, id ASC`,
      school
    ) as RawEquipmentStatusRow[];
  } else {
    rows = await prisma.$queryRawUnsafe(
      `SELECT id, schoolId, school, name, quantity, status, imageUrl, notes, sortOrder, isActive FROM EquipmentStatus WHERE ${activeSql} ORDER BY school ASC, sortOrder ASC, id ASC`
    ) as RawEquipmentStatusRow[];
  }

  return rows.map(mapEquipmentStatus);
}

export async function createEquipmentStatus(data: {
  schoolId?: number | null;
  school?: string;
  name: string;
  quantity?: string;
  status?: string;
  imageUrl?: string;
  notes?: string;
  sortOrder?: number;
}) {
  await ensureEquipmentStatusTable();
  await prisma.$executeRawUnsafe(
    "INSERT INTO EquipmentStatus (schoolId, school, name, quantity, status, imageUrl, notes, sortOrder, isActive, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP)",
    data.schoolId ?? null,
    data.school ?? "",
    data.name,
    data.quantity ?? "",
    normalizeEquipmentStatus(data.status),
    data.imageUrl ?? "",
    data.notes ?? "",
    Number(data.sortOrder ?? 0)
  );
}

export async function updateEquipmentStatus(id: number, data: {
  schoolId?: number | null;
  school?: string;
  name: string;
  quantity?: string;
  status?: string;
  imageUrl?: string;
  notes?: string;
  sortOrder?: number;
}) {
  await ensureEquipmentStatusTable();
  await prisma.$executeRawUnsafe(
    "UPDATE EquipmentStatus SET schoolId = ?, school = ?, name = ?, quantity = ?, status = ?, imageUrl = ?, notes = ?, sortOrder = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?",
    data.schoolId ?? null,
    data.school ?? "",
    data.name,
    data.quantity ?? "",
    normalizeEquipmentStatus(data.status),
    data.imageUrl ?? "",
    data.notes ?? "",
    Number(data.sortOrder ?? 0),
    id
  );
}

export async function deleteEquipmentStatus(id: number) {
  await ensureEquipmentStatusTable();
  await prisma.$executeRawUnsafe("UPDATE EquipmentStatus SET isActive = 0, updatedAt = CURRENT_TIMESTAMP WHERE id = ?", id);
}
