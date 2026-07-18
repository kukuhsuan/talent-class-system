const TERM_MARKER = /\s*\[\[TERM:([^\]]+)\]\]\s*/g;

export function courseTermOverride(notes: string | null | undefined) {
  const match = String(notes ?? "").match(/\[\[TERM:([^\]]+)\]\]/);
  return match?.[1]?.trim() ?? "";
}

export function notesWithCourseTerm(notes: unknown, term: unknown) {
  const cleanNotes = String(notes ?? "").replace(TERM_MARKER, " ").trim();
  const cleanTerm = String(term ?? "").trim();
  return cleanTerm ? `${cleanNotes}${cleanNotes ? " " : ""}[[TERM:${cleanTerm}]]` : cleanNotes;
}
