"use client";

type SaveButtonProps = {
  saving: boolean;
  onClick: () => void;
  idleText?: string;
  savingText?: string;
  className?: string;
};

export function SaveButton({
  saving,
  onClick,
  idleText = "儲存",
  savingText = "儲存中…",
  className = "",
}: SaveButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={saving}
      className={`inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-400 disabled:opacity-75 md:py-2 ${className}`}
    >
      {saving && (
        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
      )}
      {saving ? savingText : idleText}
    </button>
  );
}
