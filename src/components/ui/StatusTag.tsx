import { TONE_SOFT, toneOf, type Tone } from "./tone";

type Props = {
  /** 顯示文字；未指定 tone 時也會用來推斷語意色 */
  children: React.ReactNode;
  /** 手動指定語意色；不給就依 children（字串）自動判斷 */
  tone?: Tone;
  /** 當 children 不是純字串、但想用某個狀態字串判斷顏色時使用 */
  status?: string | null;
  size?: "sm" | "md";
  className?: string;
  title?: string;
};

/**
 * 全站統一的狀態標籤。取代各頁自行維護的 statusTone / statusClass / LEVEL_STYLE / REPLY_BADGE…
 *
 * 用法：
 *   <StatusTag>待審核</StatusTag>               // 自動判色
 *   <StatusTag tone="err">逾時未回覆</StatusTag> // 指定顏色
 */
export default function StatusTag({ children, tone, status, size = "md", className = "", title }: Props) {
  const key = status ?? (typeof children === "string" ? children : null);
  const resolved: Tone = tone ?? toneOf(key);
  const sizing = size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs";
  return (
    <span
      title={title}
      className={`inline-flex w-fit items-center gap-1.5 whitespace-nowrap rounded-full border font-semibold ${sizing} ${TONE_SOFT[resolved]} ${className}`}
    >
      <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" />
      {children}
    </span>
  );
}
