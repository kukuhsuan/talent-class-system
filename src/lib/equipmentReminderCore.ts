// 器材提醒純函式（不依賴 prisma，前端與 LINE 訊息共用）

export const EQUIPMENT_STATUSES = ["待確認", "已確認器材", "已完成組裝", "已完成轉送", "無法協助"] as const;
export type EquipmentStatus = (typeof EQUIPMENT_STATUSES)[number];

export type EquipmentReminderData = {
  isFirstClass: boolean;
  needsAssembly: boolean;
  equipmentNote: string;
  needsTransferAfterClass: boolean;
  nextSchoolName: string;
  nextClassDate: string;
  nextCourseType: string;
  nextAddress: string;
  transferNote: string;
  status: string;
};

export function normalizeEquipmentStatus(value: unknown): EquipmentStatus {
  const text = String(value ?? "").trim();
  return (EQUIPMENT_STATUSES as readonly string[]).includes(text) ? (text as EquipmentStatus) : "待確認";
}

export function hasEquipmentSettings(input: Partial<EquipmentReminderData> | null | undefined) {
  if (!input) return false;
  return Boolean(
    input.isFirstClass
    || input.needsAssembly
    || input.needsTransferAfterClass
    || String(input.equipmentNote ?? "").trim()
    || String(input.nextSchoolName ?? "").trim()
    || String(input.transferNote ?? "").trim(),
  );
}

// 後台列表的簡短標籤，例：第一堂｜需組裝｜待確認
export function equipmentSummaryLabels(row: EquipmentReminderData): string[] {
  const labels: string[] = [];
  if (row.isFirstClass) labels.push("第一堂");
  if (row.needsAssembly) labels.push("需組裝");
  if (row.needsTransferAfterClass) labels.push(row.status === "已完成轉送" ? "已完成轉送" : "課後待轉送");
  if (row.status && row.status !== "已完成轉送") labels.push(row.status);
  return labels;
}

// LINE：第一堂課／組裝提醒文字
export function equipmentFirstClassText(row: EquipmentReminderData) {
  const lines: string[] = [];
  if (row.isFirstClass && row.needsAssembly) lines.push("本堂為第一堂課，需協助確認器材是否已送達並完成組裝。");
  else if (row.isFirstClass) lines.push("本堂為第一堂課，需協助確認器材是否已送達。");
  else if (row.needsAssembly) lines.push("本堂課需協助組裝器材。");
  if (row.equipmentNote.trim()) lines.push(`器材：${row.equipmentNote.trim()}`);
  return lines.join("\n");
}

// LINE：課後轉送提醒文字
export function equipmentTransferText(row: EquipmentReminderData) {
  const lines = ["本堂課結束後，請協助將器材送至下一站。"];
  if (row.nextSchoolName.trim()) lines.push(`下一站：${row.nextSchoolName.trim()}`);
  if (row.nextClassDate.trim()) lines.push(`日期：${row.nextClassDate.trim()}`);
  if (row.nextCourseType.trim()) lines.push(`課程：${row.nextCourseType.trim()}`);
  if (row.nextAddress.trim()) lines.push(`地址：${row.nextAddress.trim()}`);
  if (row.transferNote.trim()) lines.push(`備註：${row.transferNote.trim()}`);
  return lines.join("\n");
}

// 下一站簡述（今日概況用）
export function equipmentNextStopLabel(row: EquipmentReminderData) {
  if (!row.needsTransferAfterClass) return "";
  const parts = [row.nextSchoolName.trim(), row.nextClassDate.trim(), row.nextCourseType.trim()].filter(Boolean);
  return parts.join("｜");
}
