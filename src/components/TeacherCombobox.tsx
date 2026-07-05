"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type TeacherComboboxTeacher = {
  id: number;
  name: string;
};

type TeacherComboboxProps = {
  teachers: TeacherComboboxTeacher[];
  value: number | null;
  onChange: (teacherId: number | null) => void;
  placeholder?: string;
  allowEmpty?: boolean;
  emptyLabel?: string;
  excludeTeacherId?: number | null;
  displayName?: (teacher: TeacherComboboxTeacher) => string;
  className?: string;
};

export function TeacherCombobox({
  teachers,
  value,
  onChange,
  placeholder = "-- 選擇老師 --",
  allowEmpty = false,
  emptyLabel = "-- 選擇老師 --",
  excludeTeacherId = null,
  displayName = (teacher) => teacher.name,
  className = "",
}: TeacherComboboxProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const selectedTeacher = useMemo(
    () => teachers.find((teacher) => teacher.id === value) ?? null,
    [teachers, value],
  );
  const selectedLabel = selectedTeacher ? displayName(selectedTeacher) : "";

  useEffect(() => {
    if (!open) setQuery(selectedLabel);
  }, [open, selectedLabel]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  const filteredTeachers = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return teachers
      .filter((teacher) => teacher.id !== excludeTeacherId)
      .filter((teacher) => {
        if (!keyword || teacher.id === value) return true;
        return teacher.name.toLowerCase().includes(keyword) || displayName(teacher).toLowerCase().includes(keyword);
      });
  }, [displayName, excludeTeacherId, query, teachers, value]);

  const options = useMemo(
    () => [
      ...(allowEmpty ? [{ type: "empty" as const, id: null, label: emptyLabel }] : []),
      ...filteredTeachers.map((teacher) => ({ type: "teacher" as const, id: teacher.id, label: displayName(teacher) })),
    ],
    [allowEmpty, displayName, emptyLabel, filteredTeachers],
  );

  useEffect(() => {
    setHighlightedIndex(0);
  }, [query, open]);

  const selectOption = (option: (typeof options)[number]) => {
    onChange(option.id);
    setQuery(option.label);
    setOpen(false);
    inputRef.current?.blur();
  };

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <input
        ref={inputRef}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        value={open ? query : selectedLabel}
        placeholder={placeholder}
        onFocus={() => {
          setOpen(true);
          setQuery(selectedLabel);
        }}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
            setHighlightedIndex((index) => Math.min(index + 1, Math.max(options.length - 1, 0)));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setHighlightedIndex((index) => Math.max(index - 1, 0));
          } else if (event.key === "Enter" && open && options[highlightedIndex]) {
            event.preventDefault();
            selectOption(options[highlightedIndex]);
          } else if (event.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      {open && (
        <div className="absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
          {options.length === 0 ? (
            <div className="px-3 py-2 text-sm text-slate-400">找不到老師</div>
          ) : (
            options.map((option, index) => (
              <button
                key={`${option.type}-${option.id ?? "empty"}`}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectOption(option)}
                className={`block w-full px-3 py-2 text-left text-sm ${
                  index === highlightedIndex ? "bg-blue-50 text-blue-700" : "text-slate-700 hover:bg-slate-50"
                }`}
              >
                {option.label}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
