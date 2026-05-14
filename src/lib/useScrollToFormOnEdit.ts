"use client";
import { RefObject } from "react";

export function useScrollToFormOnEdit<T extends HTMLElement, F extends HTMLElement>(
  formRef: RefObject<T | null>,
  focusRef?: RefObject<F | null>,
) {
  return function scrollToFormOnEdit() {
    window.setTimeout(() => {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      focusRef?.current?.focus();
    }, 50);
  };
}
