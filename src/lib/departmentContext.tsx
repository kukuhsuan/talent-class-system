"use client";
import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { DEPARTMENT_OPTIONS, normalizeDepartment } from "@/lib/courseMeta";

export const DEPARTMENTS = DEPARTMENT_OPTIONS;
export type Department = (typeof DEPARTMENTS)[number] | "";

type Ctx = { dept: Department; setDept: (d: Department) => void };
const DeptCtx = createContext<Ctx>({ dept: "", setDept: () => {} });

export function DepartmentProvider({ children }: { children: ReactNode }) {
  const [dept, setDeptState] = useState<Department>("");

  useEffect(() => {
    queueMicrotask(() => {
      const saved = localStorage.getItem("dept") as Department | null;
      if (saved) setDeptState(saved ? normalizeDepartment(saved) : "");
    });
  }, []);

  function setDept(d: Department) {
    const next = d ? normalizeDepartment(d) : "";
    setDeptState(next);
    localStorage.setItem("dept", next);
  }

  return <DeptCtx.Provider value={{ dept, setDept }}>{children}</DeptCtx.Provider>;
}

export function useDepartment() {
  return useContext(DeptCtx);
}
