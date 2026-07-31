import { prisma } from "@/lib/prisma";
import { DOC_STATUS } from "@/lib/teacherDocument";

// 發薪前提醒的唯一判斷來源。/salary、/accounting-center、Excel 匯出三處都呼叫這一支，
// 不要各自寫一份，否則畫面說可以匯、匯出檔說不能匯。
export type PayoutReadinessCode = "paid" | "first_time" | "bank_changed" | "missing_bank" | "missing_bankbook";

export type PayoutReadiness = {
  level: "ok" | "warn" | "block";
  code: PayoutReadinessCode;
  label: string;
  detail: string;
};

export type PayoutReadinessInput = {
  bankName: string;
  bankAccountNumber: string;
  bankAccountName: string;
  firstPaidMonth: string;
  lastPaidMonth: string;
  bankbookStatus: string;
  bankChangedAt: Date | null;
  lastPaidAt: Date | null;
};

export function teacherPayoutReadiness(input: PayoutReadinessInput): PayoutReadiness {
  const bankName = String(input.bankName ?? "").trim();
  const accountNumber = String(input.bankAccountNumber ?? "").trim();
  const accountName = String(input.bankAccountName ?? "").trim();

  // 1. 先擋「填一填就能解決」的問題，會計看到才知道要做什麼
  if (!bankName || !accountNumber || !accountName) {
    const missing = [!bankName && "銀行名稱", !accountNumber && "帳號", !accountName && "戶名"].filter(Boolean).join("、");
    return {
      level: "block",
      code: "missing_bank",
      label: "❌ 缺少銀行帳號",
      detail: `匯款資料不完整（缺${missing}），請先在老師管理補齊。`,
    };
  }

  // 2. 存摺沒審過就等於帳號沒人核對過，不能只靠打字的那一份
  if (String(input.bankbookStatus ?? "") !== DOC_STATUS.done) {
    const status = String(input.bankbookStatus ?? "") || DOC_STATUS.none;
    return {
      level: "block",
      code: "missing_bankbook",
      label: "❌ 尚未上傳存摺",
      detail: `存摺封面目前狀態為「${status}」，請請老師上傳並完成審核後再匯款。`,
    };
  }

  // 3. 從沒匯過款 → 這就是整套功能要解的主要問題
  if (!String(input.firstPaidMonth ?? "").trim()) {
    return {
      level: "warn",
      code: "first_time",
      label: "⚠️ 首次匯款，請確認資料",
      detail: "系統沒有這位老師的匯款紀錄，請在匯款前再核對一次存摺與帳號。",
    };
  }

  // 4. 上次匯款之後又動過銀行資料 → 有可能是換帳號，也有可能是被改錯
  const changedAt = input.bankChangedAt ? new Date(input.bankChangedAt) : null;
  const paidAt = input.lastPaidAt ? new Date(input.lastPaidAt) : null;
  if (changedAt && (!paidAt || changedAt.getTime() > paidAt.getTime())) {
    return {
      level: "warn",
      code: "bank_changed",
      label: "⚠️ 銀行資料已變更，請重新確認",
      detail: `上次匯款（${input.lastPaidMonth || "—"}）之後銀行資料曾於 ${changedAt.toLocaleDateString("zh-TW")} 異動，請重新核對。`,
    };
  }

  return {
    level: "ok",
    code: "paid",
    label: "✓ 已有匯款紀錄",
    detail: `上次匯款月份：${input.lastPaidMonth || input.firstPaidMonth}`,
  };
}

const BANK_FIELDS = ["bankName", "bankCode", "bankBranch", "bankAccountName", "bankAccountNumber"] as const;

function parseJson(value: string) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

// 銀行異動偵測不需要新欄位：AuditLog 已完整保存每次教師異動的 before/after，
// 找出五個銀行欄位任一有差異的最新一筆即可。
export async function bankChangedAtMap(teacherIds: number[]): Promise<Map<number, Date>> {
  const result = new Map<number, Date>();
  if (teacherIds.length === 0) return result;
  const targetIds = teacherIds.map((id) => String(id));

  const logs = await prisma.auditLog.findMany({
    where: { targetType: "Teacher", action: "update", targetId: { in: targetIds } },
    select: { targetId: true, beforeData: true, afterData: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 3000,
  }).catch(() => []);

  for (const log of logs) {
    const teacherId = Number(log.targetId);
    if (!Number.isFinite(teacherId) || result.has(teacherId)) continue; // 已取到該老師最新一筆
    const before = parseJson(log.beforeData);
    const after = parseJson(log.afterData);
    if (!before || !after) continue;
    const changed = BANK_FIELDS.some((field) => String(before[field] ?? "") !== String(after[field] ?? ""));
    if (changed) result.set(teacherId, new Date(log.createdAt));
  }
  return result;
}
