"use client";
import { createContext, useContext, useState, useEffect, ReactNode } from "react";

export const DEPARTMENTS = ["幼兒園", "國小", "安親"] as const;
export type Department = (typeof DEPARTMENTS)[number] | "";

type Ctx = { dept: Department; setDept: (d: Department) => void };
const DeptCtx = createContext<Ctx>({ dept: "", setDept: () => {} });

export function DepartmentProvider({ children }: { children: ReactNode }) {
  const [dept, setDeptState] = useState<Department>("");

  useEffect(() => {
    const saved = localStorage.getItem("dept") as Department | null;
    if (saved) setDeptState(saved);
  }, []);

  function setDept(d: Department) {
    setDeptState(d);
    localStorage.setItem("dept", d);
  }

  return <DeptCtx.Provider value={{ dept, setDept }}>{children}</DeptCtx.Provider>;
}

export function useDepartment() {
  return useContext(DeptCtx);
}
