"use client";

export type ToastState = {
  type: "success" | "error";
  message: string;
} | null;

export function Toast({ toast }: { toast: ToastState }) {
  if (!toast) return null;

  const styles =
    toast.type === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : "border-red-200 bg-red-50 text-red-700";

  return (
    <div className={`fixed right-4 top-4 z-50 rounded-xl border px-4 py-3 text-sm font-medium shadow-lg ${styles}`}>
      {toast.message}
    </div>
  );
}
