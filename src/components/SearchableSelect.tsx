"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

export type SearchableSelectOption<T extends string | number> = {
  value: T;
  label: string;
  searchText?: string;
};

type SearchableSelectProps<T extends string | number> = {
  options: Array<SearchableSelectOption<T>>;
  value: T | "" | null;
  onChange: (value: T | null) => void;
  placeholder?: string;
  emptyText?: string;
  allowEmpty?: boolean;
  emptyLabel?: string;
  className?: string;
};

export function SearchableSelect<T extends string | number>({
  options,
  value,
  onChange,
  placeholder = "搜尋選擇",
  emptyText = "查無符合資料，請確認關鍵字",
  allowEmpty = true,
  emptyLabel = "清除選擇",
  className = "",
}: SearchableSelectProps<T>) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const selected = useMemo(() => options.find((option) => String(option.value) === String(value ?? "")) ?? null, [options, value]);
  const selectedLabel = selected?.label ?? "";

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return options;
    return options.filter((option) => `${option.label} ${option.searchText ?? ""}`.toLowerCase().includes(keyword));
  }, [options, query]);

  const rows = useMemo(
    () => [
      ...(allowEmpty ? [{ type: "empty" as const, value: null, label: emptyLabel }] : []),
      ...filtered.map((option) => ({ type: "option" as const, value: option.value, label: option.label })),
    ],
    [allowEmpty, emptyLabel, filtered],
  );

  function select(row: (typeof rows)[number]) {
    onChange(row.value);
    setQuery(row.label);
    setOpen(false);
  }

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <input
        ref={inputRef}
        role="combobox"
        aria-controls={listId}
        aria-autocomplete="list"
        aria-expanded={open}
        value={open ? query : selectedLabel}
        placeholder={placeholder}
        onFocus={() => {
          setOpen(true);
          setQuery(selectedLabel);
          setHighlightedIndex(0);
        }}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
          setHighlightedIndex(0);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
            setHighlightedIndex((index) => Math.min(index + 1, Math.max(rows.length - 1, 0)));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setHighlightedIndex((index) => Math.max(index - 1, 0));
          } else if (event.key === "Enter" && open && rows[highlightedIndex]) {
            event.preventDefault();
            select(rows[highlightedIndex]);
          } else if (event.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      {open && (
        <div id={listId} className="absolute z-50 mt-1 max-h-72 w-full overflow-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
          {filtered.length === 0 && query.trim() ? (
            <div className="px-3 py-3 text-sm text-slate-400">{emptyText}</div>
          ) : rows.length === 0 ? (
            <div className="px-3 py-3 text-sm text-slate-400">{emptyText}</div>
          ) : (
            rows.map((row, index) => (
              <button
                key={`${row.type}-${String(row.value ?? "empty")}`}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => select(row)}
                className={`block w-full px-3 py-2 text-left text-sm ${
                  index === highlightedIndex ? "bg-blue-50 text-blue-700" : "text-slate-700 hover:bg-slate-50"
                }`}
              >
                {row.label}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
