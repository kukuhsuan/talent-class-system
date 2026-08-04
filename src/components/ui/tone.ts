/**
 * 全站狀態語意色的單一來源。
 *
 * 規則：一個語意只有一組顏色。
 *  ok   完成／正常／可配合
 *  warn 待處理／等人回應
 *  err  失敗／異常／無法配合
 *  info 進行中／已送出／已通知
 *  idle 已結束／已取消／不需動作
 *
 * 過去各頁自行定義色表（teacher-leaves、notify、alerts、pre-class-meeting、
 * equipment、equipment-where、course-change-requests、ratings…），造成
 * 「成功」有 green-100／green-50／emerald-50 三種寫法、
 * 「等人回應」橫跨 amber／slate／blue 三色。統一到這裡。
 */
export type Tone = "ok" | "warn" | "err" | "info" | "idle";

/** 淺底 + 深字 + 邊框，用於 badge / tag */
export const TONE_SOFT: Record<Tone, string> = {
  ok: "bg-emerald-50 text-emerald-700 border-emerald-200",
  warn: "bg-amber-50 text-amber-700 border-amber-200",
  err: "bg-rose-50 text-rose-700 border-rose-200",
  info: "bg-blue-50 text-blue-700 border-blue-200",
  idle: "bg-slate-100 text-slate-600 border-slate-200",
};

/** 卡片用（含 hover），用於 StatCard */
export const TONE_CARD: Record<Tone | "default", string> = {
  default: "bg-white text-slate-800 border-slate-200",
  ok: "bg-emerald-50 text-emerald-800 border-emerald-200",
  warn: "bg-amber-50 text-amber-800 border-amber-200",
  err: "bg-rose-50 text-rose-800 border-rose-200",
  info: "bg-blue-50 text-blue-800 border-blue-200",
  idle: "bg-slate-50 text-slate-700 border-slate-200",
};

export const TONE_CARD_HOVER: Record<Tone | "default", string> = {
  default: "hover:bg-slate-50",
  ok: "hover:bg-emerald-100",
  warn: "hover:bg-amber-100",
  err: "hover:bg-rose-100",
  info: "hover:bg-blue-100",
  idle: "hover:bg-slate-100",
};

/**
 * 依中文／英文狀態字串推斷語意色。
 * 找不到對應時回 idle（中性），呼叫端也可以直接指定 tone 覆寫。
 */
const STATUS_TONE: Record<string, Tone> = {
  // 完成 / 正常
  已完成: "ok",
  已找到代課: "ok",
  老師可配合: "ok",
  可代課: "ok",
  已回報: "ok",
  正常: "ok",
  成功: "ok",
  已送達: "ok",
  已接受: "ok",
  會參加: "ok",
  已確認: "ok",
  success: "ok",

  // 待處理 / 等人回應
  待審核: "warn",
  待行政審核: "warn",
  需要討論: "warn",
  需補充: "warn",
  待回報: "warn",
  未回覆: "warn",
  尚未回覆: "warn",
  未通知: "warn",
  待填寫: "warn",
  未詢問: "warn",
  未綁定: "warn",
  部分失敗: "warn",
  草稿: "warn",
  unbound: "warn",
  partial: "warn",
  pending: "warn",

  // 失敗 / 異常
  已駁回: "err",
  老師無法配合: "err",
  無法配合: "err",
  無法代課: "err",
  無法參加: "err",
  無法協助: "err",
  失敗: "err",
  通知失敗: "err",
  執行失敗: "err",
  損壞: "err",
  遺失: "err",
  P1: "err",
  failed: "err",
  unavailable: "err",

  // 進行中 / 已送出
  "已核准，待找代課": "info",
  已核准: "info",
  尋找代課中: "info",
  待老師回覆: "info",
  已詢問: "info",
  已通知: "info",
  已送出: "info",
  處理中: "info",
  available: "info",

  // 已結束 / 不需動作
  已取消: "idle",
  已忽略: "idle",
  已失效: "idle",
  取消代課: "idle",
  停課: "idle",
  略過: "idle",
  尚未執行: "idle",
  P3: "idle",
  cancelled: "idle",
  expired: "idle",
  skipped: "idle",
  noLongerNeeded: "idle",
};

export function toneOf(status: string | null | undefined, fallback: Tone = "idle"): Tone {
  if (!status) return fallback;
  return STATUS_TONE[status] ?? fallback;
}
