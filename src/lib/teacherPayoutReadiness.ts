import { prisma } from "@/lib/prisma";
import { ensurePayrollRunTable, type PayrollRunRow } from "@/lib/payrollRun";

// 發薪前提醒的唯一判斷來源。/salary、/accounting-center、Excel 匯出三處都呼叫這一支，
// 不要各自寫一份，否則畫面說可以匯、匯出檔說不能匯。
export type PayoutReadinessCode =
  | "paid"
  | "first_time"
  | "bank_changed"
  | "missing_bank"
  | "missing_bankbook"
  | "held_offline";

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
  // 會計線下已持有這位老師的匯款資料（系統上線前就在匯款的老師）
  bankHeldOfflineAt?: Date | null;
  bankHeldOfflineBy?: string;
  bankHeldOfflineNote?: string;
};

export type TeacherPayoutHistory = {
  firstPaidMonth: string;
  lastPaidMonth: string;
  lastPaidAt: Date | null;
};

// 舊月份可能已有結算／匯款快照，但 Teacher 的匯款基準欄位尚未回填。
// 薪資頁直接以既有快照補足判斷，避免每到新月份又把舊老師誤判為首次匯款。
export async function payrollHistoryByTeacher(): Promise<Map<number, TeacherPayoutHistory>> {
  await ensurePayrollRunTable();
  const runs = await prisma.$queryRawUnsafe<PayrollRunRow[]>(
    'SELECT * FROM "PayrollRun" ORDER BY "payoutMonth" ASC',
  );
  const history = new Map<number, TeacherPayoutHistory>();

  for (const run of runs) {
    let parsed: { results?: Array<{ teacher?: { id?: number }; total?: number }> } | null = null;
    try {
      parsed = JSON.parse(run.snapshot || "{}");
    } catch {
      continue;
    }
    const paidAt = run.finalizedAt ? new Date(run.finalizedAt) : null;
    for (const row of parsed?.results ?? []) {
      const teacherId = Number(row?.teacher?.id);
      if (!Number.isFinite(teacherId) || !(Number(row?.total ?? 0) > 0)) continue;
      const current = history.get(teacherId);
      history.set(teacherId, {
        firstPaidMonth: current?.firstPaidMonth || run.payoutMonth,
        lastPaidMonth: run.payoutMonth,
        lastPaidAt: paidAt && !Number.isNaN(paidAt.getTime()) ? paidAt : current?.lastPaidAt ?? null,
      });
    }
  }

  return history;
}

function formatDate(value: Date) {
  return value.toLocaleDateString("zh-TW");
}

export function teacherPayoutReadiness(input: PayoutReadinessInput): PayoutReadiness {
  const bankName = String(input.bankName ?? "").trim();
  const accountNumber = String(input.bankAccountNumber ?? "").trim();
  const accountName = String(input.bankAccountName ?? "").trim();
  const heldAt = input.bankHeldOfflineAt ? new Date(input.bankHeldOfflineAt) : null;
  const heldOffline = Boolean(heldAt && !Number.isNaN(heldAt.getTime()));
  const hasPaymentHistory = Boolean(String(input.firstPaidMonth ?? "").trim());
  const changedAt = input.bankChangedAt ? new Date(input.bankChangedAt) : null;
  const paidAt = input.lastPaidAt ? new Date(input.lastPaidAt) : null;

  // 0. 系統上線前就在匯款的老師：帳號與存摺都在會計手上，系統沒有也不需要有。
  //    這種人不是「資料缺漏」而是「資料不在系統」，每個月拿 ❌ 提醒他只會讓人習慣忽略紅字。
  //    但也不能當成完全沒事——標記者與時間要一直掛在畫面上，才追得回是誰說可以匯的。
  if (heldOffline && (!bankName || !accountNumber || !accountName)) {
    const by = String(input.bankHeldOfflineBy ?? "").trim();
    const note = String(input.bankHeldOfflineNote ?? "").trim();
    return {
      level: "ok",
      code: "held_offline",
      label: "✓ 匯款資料在會計端",
      detail: `${by || "會計"}於 ${formatDate(heldAt as Date)} 確認已持有此老師的匯款資料${note ? `（${note}）` : ""}；系統未保存帳號與存摺，如需改由系統控管請補齊資料後取消此註記。`,
    };
  }

  // 1. 已經匯款成功過，就代表會計曾確認過這份資料；這是老師層級的永久狀態，
  //    不應隨查詢月份重設。只有「上次匯款後銀行資料又被修改」才重新提醒核對。
  if (hasPaymentHistory) {
    if (changedAt && (!paidAt || changedAt.getTime() > paidAt.getTime())) {
      return {
        level: "warn",
        code: "bank_changed",
        label: "⚠️ 銀行資料已變更，請重新確認",
        detail: `上次匯款（${input.lastPaidMonth || input.firstPaidMonth}）之後銀行資料曾於 ${changedAt.toLocaleDateString("zh-TW")} 異動，請重新核對。`,
      };
    }
    return {
      level: "ok",
      code: "paid",
      label: "✓ 匯款資料已確認",
      detail: `自 ${input.firstPaidMonth} 起沿用；只有帳戶資料變更時才需要重新確認。`,
    };
  }

  // 2. 新進老師才需要檢查「填一填就能解決」的問題
  if (!bankName || !accountNumber || !accountName) {
    const missing = [!bankName && "銀行名稱", !accountNumber && "帳號", !accountName && "戶名"].filter(Boolean).join("、");
    return {
      level: "block",
      code: "missing_bank",
      label: "❌ 缺少銀行帳號",
      detail: `匯款資料不完整（缺${missing}），請先在老師管理補齊。`,
    };
  }

  // 3. 存摺不是匯款必要條件；銀行資料齊全即可進行首次匯款確認。
  return {
    level: "warn",
    code: "first_time",
    label: "⚠️ 首次匯款，請確認資料",
    detail: "系統沒有這位老師的匯款紀錄，請在匯款前再核對一次銀行帳號。",
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
