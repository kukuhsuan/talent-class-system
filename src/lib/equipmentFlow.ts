import { prisma } from "@/lib/prisma";

export const EQUIPMENT_DELIVERY_METHODS = ["未安排", "教練送", "員工送", "物流送", "園所自取", "其他"] as const;
export const EQUIPMENT_FLOW_STATUSES = ["未詢問", "已詢問", "已接受", "已送達", "無法協助", "已取消"] as const;

export type EquipmentDeliveryMethod = (typeof EQUIPMENT_DELIVERY_METHODS)[number];
export type EquipmentFlowStatus = (typeof EQUIPMENT_FLOW_STATUSES)[number];

export type EquipmentFlowInput = {
  attendanceId?: number | null;
  courseId?: number | null;
  date?: string;
  courseTime?: string;
  courseName?: string;
  schoolName?: string;
  schoolAddress?: string;
  equipmentName?: string;
  equipmentContent?: string;
  currentLocation?: string;
  nextSchoolName?: string;
  nextDate?: string;
  nextAddress?: string;
  deliveryMethod?: string;
  responsiblePerson?: string;
  responsibleTeacherId?: number | null;
  responsiblePhone?: string;
  transportSubsidyEligible?: boolean;
  status?: string;
  notes?: string;
  updatedBy?: string;
};

export type EquipmentFlowRow = Required<Omit<EquipmentFlowInput, "responsibleTeacherId">> & {
  id: number;
  attendanceId: number | null;
  courseId: number | null;
  responsibleTeacherId: number | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

type RawEquipmentFlowRow = Omit<EquipmentFlowRow, "isActive" | "transportSubsidyEligible"> & {
  isActive: boolean | number;
  transportSubsidyEligible: boolean | number;
};

let tableReady = false;

export async function ensureEquipmentFlowTable() {
  if (tableReady) return;
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS EquipmentFlow (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      attendanceId INTEGER,
      courseId INTEGER,
      date TEXT NOT NULL DEFAULT '',
      courseTime TEXT NOT NULL DEFAULT '',
      courseName TEXT NOT NULL DEFAULT '',
      schoolName TEXT NOT NULL DEFAULT '',
      schoolAddress TEXT NOT NULL DEFAULT '',
      equipmentName TEXT NOT NULL DEFAULT '',
      equipmentContent TEXT NOT NULL DEFAULT '',
      currentLocation TEXT NOT NULL DEFAULT '',
      nextSchoolName TEXT NOT NULL DEFAULT '',
      nextDate TEXT NOT NULL DEFAULT '',
      nextAddress TEXT NOT NULL DEFAULT '',
      deliveryMethod TEXT NOT NULL DEFAULT '未安排',
      responsiblePerson TEXT NOT NULL DEFAULT '',
      responsibleTeacherId INTEGER,
      responsiblePhone TEXT NOT NULL DEFAULT '',
      transportSubsidyEligible BOOLEAN NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT '未詢問',
      notes TEXT NOT NULL DEFAULT '',
      updatedBy TEXT NOT NULL DEFAULT '',
      isActive BOOLEAN NOT NULL DEFAULT 1,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await prisma.$executeRawUnsafe("CREATE INDEX IF NOT EXISTS EquipmentFlow_date_idx ON EquipmentFlow(date)");
  await prisma.$executeRawUnsafe("CREATE INDEX IF NOT EXISTS EquipmentFlow_status_idx ON EquipmentFlow(status)");
  await prisma.$executeRawUnsafe("CREATE INDEX IF NOT EXISTS EquipmentFlow_deliveryMethod_idx ON EquipmentFlow(deliveryMethod)");
  await prisma.$executeRawUnsafe("CREATE INDEX IF NOT EXISTS EquipmentFlow_responsiblePerson_idx ON EquipmentFlow(responsiblePerson)");
  await prisma.$executeRawUnsafe("CREATE INDEX IF NOT EXISTS EquipmentFlow_responsibleTeacherId_idx ON EquipmentFlow(responsibleTeacherId)");
  await prisma.$executeRawUnsafe("CREATE INDEX IF NOT EXISTS EquipmentFlow_attendanceId_idx ON EquipmentFlow(attendanceId)");
  await prisma.$executeRawUnsafe("ALTER TABLE EquipmentFlow ADD COLUMN transportSubsidyEligible BOOLEAN NOT NULL DEFAULT 0").catch(() => undefined);
  tableReady = true;
}

export function normalizeEquipmentDeliveryMethod(value: unknown): EquipmentDeliveryMethod {
  const text = String(value ?? "").trim();
  return EQUIPMENT_DELIVERY_METHODS.includes(text as EquipmentDeliveryMethod) ? text as EquipmentDeliveryMethod : "未安排";
}

export function normalizeEquipmentFlowStatus(value: unknown): EquipmentFlowStatus {
  const text = String(value ?? "").trim();
  const legacy: Record<string, EquipmentFlowStatus> = {
    未安排: "未詢問",
    待送達: "已接受",
    配送中: "已接受",
    課後待帶走: "已接受",
    已完成: "已送達",
    異常: "無法協助",
  };
  if (legacy[text]) return legacy[text];
  return EQUIPMENT_FLOW_STATUSES.includes(text as EquipmentFlowStatus) ? text as EquipmentFlowStatus : "未詢問";
}

function cleanText(value: unknown) {
  return String(value ?? "").trim();
}

function isoDate(value: unknown) {
  return cleanText(value).slice(0, 10);
}

function mapRow(row: RawEquipmentFlowRow): EquipmentFlowRow {
  return {
    ...row,
    id: Number(row.id),
    attendanceId: row.attendanceId == null ? null : Number(row.attendanceId),
    courseId: row.courseId == null ? null : Number(row.courseId),
    responsibleTeacherId: row.responsibleTeacherId == null ? null : Number(row.responsibleTeacherId),
    deliveryMethod: normalizeEquipmentDeliveryMethod(row.deliveryMethod),
    status: normalizeEquipmentFlowStatus(row.status),
    transportSubsidyEligible: row.transportSubsidyEligible === true || row.transportSubsidyEligible === 1,
    isActive: row.isActive === true || row.isActive === 1,
    createdAt: String(row.createdAt ?? ""),
    updatedAt: String(row.updatedAt ?? ""),
  };
}

export function flowData(input: EquipmentFlowInput) {
  return {
    attendanceId: input.attendanceId ? Number(input.attendanceId) : null,
    courseId: input.courseId ? Number(input.courseId) : null,
    date: isoDate(input.date),
    courseTime: cleanText(input.courseTime),
    courseName: cleanText(input.courseName),
    schoolName: cleanText(input.schoolName),
    schoolAddress: cleanText(input.schoolAddress),
    equipmentName: cleanText(input.equipmentName),
    equipmentContent: cleanText(input.equipmentContent),
    currentLocation: cleanText(input.currentLocation),
    nextSchoolName: cleanText(input.nextSchoolName),
    nextDate: isoDate(input.nextDate),
    nextAddress: cleanText(input.nextAddress),
    deliveryMethod: normalizeEquipmentDeliveryMethod(input.deliveryMethod),
    responsiblePerson: cleanText(input.responsiblePerson),
    responsibleTeacherId: input.responsibleTeacherId ? Number(input.responsibleTeacherId) : null,
    responsiblePhone: cleanText(input.responsiblePhone),
    transportSubsidyEligible: Boolean(input.transportSubsidyEligible),
    status: normalizeEquipmentFlowStatus(input.status),
    notes: cleanText(input.notes),
    updatedBy: cleanText(input.updatedBy),
  };
}

export async function listEquipmentFlows(filters: {
  date?: string;
  course?: string;
  school?: string;
  status?: string;
  deliveryMethod?: string;
  responsible?: string;
  search?: string;
} = {}) {
  await ensureEquipmentFlowTable();
  const where = ["isActive = 1"];
  const args: unknown[] = [];
  if (filters.date) {
    where.push("date = ?");
    args.push(filters.date.slice(0, 10));
  }
  if (filters.status) {
    where.push("status = ?");
    args.push(normalizeEquipmentFlowStatus(filters.status));
  }
  if (filters.deliveryMethod) {
    where.push("deliveryMethod = ?");
    args.push(normalizeEquipmentDeliveryMethod(filters.deliveryMethod));
  }
  if (filters.course) {
    where.push("courseName LIKE ?");
    args.push(`%${filters.course.trim()}%`);
  }
  if (filters.school) {
    where.push("(schoolName LIKE ? OR nextSchoolName LIKE ?)");
    args.push(`%${filters.school.trim()}%`, `%${filters.school.trim()}%`);
  }
  if (filters.responsible) {
    where.push("responsiblePerson LIKE ?");
    args.push(`%${filters.responsible.trim()}%`);
  }
  if (filters.search) {
    where.push("(equipmentName LIKE ? OR equipmentContent LIKE ? OR currentLocation LIKE ? OR nextSchoolName LIKE ? OR notes LIKE ?)");
    const q = `%${filters.search.trim()}%`;
    args.push(q, q, q, q, q);
  }
  const rows = await prisma.$queryRawUnsafe<RawEquipmentFlowRow[]>(
    `SELECT * FROM EquipmentFlow WHERE ${where.join(" AND ")} ORDER BY date ASC, courseTime ASC, id DESC`,
    ...args,
  );
  return rows.map(mapRow);
}

export async function getEquipmentFlow(id: number) {
  await ensureEquipmentFlowTable();
  const rows = await prisma.$queryRawUnsafe<RawEquipmentFlowRow[]>("SELECT * FROM EquipmentFlow WHERE id = ? LIMIT 1", id);
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function createEquipmentFlow(input: EquipmentFlowInput) {
  await ensureEquipmentFlowTable();
  const data = flowData(input);
  await prisma.$executeRawUnsafe(
    `INSERT INTO EquipmentFlow
      (attendanceId, courseId, date, courseTime, courseName, schoolName, schoolAddress, equipmentName, equipmentContent, currentLocation, nextSchoolName, nextDate, nextAddress, deliveryMethod, responsiblePerson, responsibleTeacherId, responsiblePhone, transportSubsidyEligible, status, notes, updatedBy, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    data.attendanceId, data.courseId, data.date, data.courseTime, data.courseName, data.schoolName, data.schoolAddress,
    data.equipmentName, data.equipmentContent, data.currentLocation, data.nextSchoolName, data.nextDate, data.nextAddress,
    data.deliveryMethod, data.responsiblePerson, data.responsibleTeacherId, data.responsiblePhone, data.transportSubsidyEligible, data.status, data.notes, data.updatedBy,
  );
  const rows = await prisma.$queryRawUnsafe<Array<{ id: number }>>("SELECT id FROM EquipmentFlow WHERE isActive = 1 ORDER BY id DESC LIMIT 1");
  return getEquipmentFlow(Number(rows[0]?.id ?? 0));
}

export async function updateEquipmentFlow(id: number, input: EquipmentFlowInput) {
  await ensureEquipmentFlowTable();
  const data = flowData(input);
  await prisma.$executeRawUnsafe(
    `UPDATE EquipmentFlow SET
      attendanceId = ?, courseId = ?, date = ?, courseTime = ?, courseName = ?, schoolName = ?, schoolAddress = ?,
      equipmentName = ?, equipmentContent = ?, currentLocation = ?, nextSchoolName = ?, nextDate = ?, nextAddress = ?,
      deliveryMethod = ?, responsiblePerson = ?, responsibleTeacherId = ?, responsiblePhone = ?, transportSubsidyEligible = ?, status = ?, notes = ?,
      updatedBy = ?, updatedAt = CURRENT_TIMESTAMP
     WHERE id = ?`,
    data.attendanceId, data.courseId, data.date, data.courseTime, data.courseName, data.schoolName, data.schoolAddress,
    data.equipmentName, data.equipmentContent, data.currentLocation, data.nextSchoolName, data.nextDate, data.nextAddress,
    data.deliveryMethod, data.responsiblePerson, data.responsibleTeacherId, data.responsiblePhone, data.transportSubsidyEligible, data.status, data.notes,
    data.updatedBy, id,
  );
  return getEquipmentFlow(id);
}

export async function updateEquipmentFlowStatus(id: number, status: string, updatedBy = "") {
  await ensureEquipmentFlowTable();
  await prisma.$executeRawUnsafe(
    "UPDATE EquipmentFlow SET status = ?, updatedBy = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ? AND isActive = 1",
    normalizeEquipmentFlowStatus(status),
    cleanText(updatedBy),
    id,
  );
  return getEquipmentFlow(id);
}

export async function deleteEquipmentFlow(id: number, updatedBy = "") {
  await ensureEquipmentFlowTable();
  await prisma.$executeRawUnsafe(
    "UPDATE EquipmentFlow SET isActive = 0, updatedBy = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?",
    cleanText(updatedBy),
    id,
  );
}
