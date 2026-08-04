"use client";
import { useId } from "react";

/* ------------------------------------------------------------------ *
 * Field：標籤與輸入框的正確關聯（htmlFor ↔ id）
 *
 * 修正全站 htmlFor = 0 個、<label> 卻有 200+ 個的問題：
 * 過去 label 只是 input 的兄弟節點，螢幕閱讀器唸不出欄位名稱，
 * 點文字也不會 focus 到輸入框。
 *
 * 用法（id 自動產生，不可能忘記綁）：
 *   <Field label="年份">
 *     {(id) => <select id={id} value={year} onChange={...}>…</select>}
 *   </Field>
 * ------------------------------------------------------------------ */

type FieldProps = {
  label: string;
  children: (id: string) => React.ReactNode;
  /** 欄位下方的說明或錯誤提示 */
  hint?: React.ReactNode;
  error?: string | null;
  required?: boolean;
  className?: string;
};

export function Field({ label, children, hint, error, required, className = "" }: FieldProps) {
  const id = useId();
  const describedBy = error ? `${id}-err` : hint ? `${id}-hint` : undefined;
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <label htmlFor={id} className="text-xs font-semibold text-slate-600">
        {label}
        {required ? <span className="ml-0.5 text-rose-600">*</span> : null}
      </label>
      <div aria-describedby={describedBy}>{children(id)}</div>
      {error ? (
        <p id={`${id}-err`} className="text-xs font-medium text-rose-600">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs text-slate-500">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** 篩選區塊的外框，讓 15 個列表頁的篩選列長得一樣 */
export function FilterBar({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`flex flex-wrap items-end gap-2 md:gap-3 ${className}`}>{children}</div>;
}

/* ------------------------------------------------------------------ *
 * FilterChips：狀態快選（全部／待審核／已核准…），含筆數
 * ------------------------------------------------------------------ */

export type ChipOption = {
  value: string;
  label: string;
  count?: number;
};

export function FilterChips({
  options,
  value,
  onChange,
  ariaLabel = "狀態篩選",
  className = "",
}: {
  options: ChipOption[];
  value: string;
  onChange: (value: string) => void;
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <div role="group" aria-label={ariaLabel} className={`flex flex-wrap gap-2 ${className}`}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3.5 text-xs font-semibold transition-colors ${
              active
                ? "border-blue-700 bg-blue-700 text-white"
                : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            {option.label}
            {typeof option.count === "number" ? (
              <span className={active ? "font-bold" : "font-bold text-slate-500"}>{option.count}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/** 統一的輸入框外觀，供 Field 內的 select / input 直接套用 */
export const controlClass =
  "w-full min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800 focus:border-blue-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-200";
