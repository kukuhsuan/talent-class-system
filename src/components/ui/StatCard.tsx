import Link from "next/link";
import { TONE_CARD, TONE_CARD_HOVER, type Tone } from "./tone";

type Props = {
  label: string;
  value: React.ReactNode;
  /** 數值下方的補充說明 */
  hint?: React.ReactNode;
  tone?: Tone | "default";
  /** 給了就整張卡可點 */
  href?: string;
  loading?: boolean;
  className?: string;
};

/**
 * 全站統一的統計卡片。取代散在 10 個頁面的 Metric / SummaryCard / Stat 等
 * 6 種同名不同實作（圓角 xl vs 2xl、字級 2xl vs 3xl、有無 shadow 不一）。
 */
export default function StatCard({
  label,
  value,
  hint,
  tone = "default",
  href,
  loading = false,
  className = "",
}: Props) {
  const base = `block rounded-xl border p-4 shadow-sm transition-colors ${TONE_CARD[tone]} ${className}`;
  const body = (
    <>
      <div className="text-xs font-semibold opacity-80">{label}</div>
      {loading ? (
        <div className="mt-2 h-8 w-16 animate-pulse rounded-lg bg-black/5" />
      ) : (
        <div className="mt-1 text-2xl font-bold leading-tight md:text-3xl">{value}</div>
      )}
      {hint ? <div className="mt-1 text-xs opacity-70">{hint}</div> : null}
    </>
  );

  if (href) {
    return (
      <Link href={href} className={`${base} ${TONE_CARD_HOVER[tone]}`}>
        {body}
      </Link>
    );
  }
  return <div className={base}>{body}</div>;
}
