const TERM_MARKER = /\s*\[\[TERM:([^\]]+)\]\]\s*/g;

export function courseTermOverride(notes: string | null | undefined) {
  const match = String(notes ?? "").match(/\[\[TERM:([^\]]+)\]\]/);
  return match?.[1]?.trim() ?? "";
}

/**
 * 課程所屬學期：人工標記優先；未標記時依開課日判斷。
 * 學年度第 1 學期自 9 月起，第 2 學期為 1–8 月。
 */
export function resolveCourseTerm(input: {
  notes?: string | null;
  startDate?: Date | string | null;
}) {
  const override = courseTermOverride(input.notes);
  if (override) return override;

  const raw = input.startDate;
  const date = raw instanceof Date ? raw : raw ? new Date(raw) : null;
  if (!date || Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  return month >= 9 ? `${year - 1911}-1` : `${year - 1912}-2`;
}

export function notesWithCourseTerm(notes: unknown, term: unknown) {
  const cleanNotes = String(notes ?? "").replace(TERM_MARKER, " ").trim();
  const cleanTerm = String(term ?? "").trim();
  return cleanTerm ? `${cleanNotes}${cleanNotes ? " " : ""}[[TERM:${cleanTerm}]]` : cleanNotes;
}
