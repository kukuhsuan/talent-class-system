"use client";
import { useCallback, useRef, useState } from "react";
import type { ToastState } from "@/components/Toast";

export function useToast() {
  const [toast, setToast] = useState<ToastState>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((type: "success" | "error", message: string, duration = 1800) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setToast({ type, message });
    timerRef.current = setTimeout(() => setToast(null), duration);
  }, []);

  return { toast, showToast };
}
