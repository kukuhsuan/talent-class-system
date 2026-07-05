import { prisma } from "@/lib/prisma";
import {
  hasEquipmentSettings,
  normalizeEquipmentStatus,
  type EquipmentReminderData,
  type EquipmentStatus,
} from "@/lib/equipmentReminderCore";

export {
  EQUIPMENT_STATUSES,
  equipmentFirstClassText,
  equipmentNextStopLabel,
  equipmentSummaryLabels,
  equipmentTransferText,
  hasEquipmentSettings,
  normalizeEquipmentStatus,
} from "@/lib/equipmentReminderCore";
export type { EquipmentReminderData, EquipmentStatus } from "@/lib/equipmentReminderCore";

let equipmentTableReady = false;

// 執行期建表（與 TeacherLeave / EquipmentStatus 相同模式），部署零停機、不需 migration
export async function ensureAttendanceEquipmentTable() {
  if (equipmentTableReady) return;
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS AttendanceEquipment (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      attendanceId INTEGER NOT NULL UNIQUE,
      isFirstClass BOOLEAN NOT NULL DEFAULT 0,
      needsAssembly BOOLEAN NOT NULL DEFAULT 0,
      equipmentNote TEXT NOT NULL DEFAULT '',
      needsTransferAfterClass BOOLEAN NOT NULL DEFAULT 0,
      nextSchoolName TEXT NOT NULL DEFAULT '',
      nextClassDate TEXT NOT NULL DEFAULT '',
      nextCourseType TEXT NOT NULL DEFAULT '',
      nextAddress TEXT NOT NULL DEFAULT '',
      transferNote TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT '待確認',
      confirmedAt DATETIME,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  equipmentTableReady = true;
}

// 從 API body 解析器材設定；undefined = 這次請求不動器材設定
export function parseEquipmentInput(raw: unknown): EquipmentReminderData | undefined {
  if (raw === null || raw === undefined || typeof raw !== "object") return undefined;
  const data = raw as Record<string, unknown>;
  return {
    isFirstClass: Boolean(data.isFirstClass),
    needsAssembly: Boolean(data.needsAssembly),
    equipmentNote: String(data.equipmentNote ?? "").trim(),
    needsTransferAfterClass: Boolean(data.needsTransferAfterClass),
    nextSchoolName: String(data.nextSchoolName ?? "").trim(),
    nextClassDate: String(data.nextClassDate ?? "").trim(),
    nextCourseType: String(data.nextCourseType ?? "").trim(),
    nextAddress: String(data.nextAddress ?? "").trim(),
    transferNote: String(data.transferNote ?? "").trim(),
    status: normalizeEquipmentStatus(data.status),
  };
}

// 儲存器材設定：全部空白視為清除（刪除該筆提醒）
export async function saveAttendanceEquipment(attendanceId: number, input: EquipmentReminderData) {
  await ensureAttendanceEquipmentTable();
  if (!hasEquipmentSettings(input)) {
    await prisma.attendanceEquipment.deleteMany({ where: { attendanceId } });
    return null;
  }
  const fields = {
    isFirstClass: input.isFirstClass,
    needsAssembly: input.needsAssembly,
    equipmentNote: input.equipmentNote,
    needsTransferAfterClass: input.needsTransferAfterClass,
    nextSchoolName: input.nextSchoolName,
    nextClassDate: input.nextClassDate,
    nextCourseType: input.nextCourseType,
    nextAddress: input.nextAddress,
    transferNote: input.transferNote,
    status: normalizeEquipmentStatus(input.status),
  };
  return prisma.attendanceEquipment.upsert({
    where: { attendanceId },
    create: { attendanceId, ...fields },
    update: fields,
  });
}

export async function deleteAttendanceEquipment(attendanceId: number) {
  await ensureAttendanceEquipmentTable();
  await prisma.attendanceEquipment.deleteMany({ where: { attendanceId } }).catch(() => undefined);
}

export async function equipmentByAttendanceIds(attendanceIds: number[]) {
  const ids = [...new Set(attendanceIds.filter((id) => Number.isFinite(id) && id > 0))];
  if (ids.length === 0) return new Map<number, EquipmentReminderData & { attendanceId: number }>();
  await ensureAttendanceEquipmentTable();
  const rows = await prisma.attendanceEquipment.findMany({ where: { attendanceId: { in: ids } } });
  return new Map(rows.map((row) => [row.attendanceId, row]));
}

// 老師透過 LINE 按鈕回覆時更新狀態
export async function setEquipmentStatus(attendanceId: number, status: EquipmentStatus) {
  await ensureAttendanceEquipmentTable();
  const existing = await prisma.attendanceEquipment.findUnique({ where: { attendanceId } });
  if (!existing) return null;
  return prisma.attendanceEquipment.update({
    where: { attendanceId },
    data: { status, confirmedAt: new Date() },
  });
}
