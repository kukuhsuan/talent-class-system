"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useDepartment, DEPARTMENTS } from "@/lib/departmentContext";

const NAV = [
  { href: "/", label: "今日概況" },
  { href: "/schedule", label: "週課表" },
  { href: "/attendance", label: "出勤紀錄" },
  { href: "/teachers", label: "老師管理" },
  { href: "/courses", label: "課程排班" },
  { href: "/schools", label: "園所管理" },
  { href: "/school-stats", label: "園所人數" },
  { href: "/substitutes", label: "代課紀錄" },
  { href: "/salary", label: "薪資計算" },
  { href: "/progress", label: "課程進度" },
  { href: "/assessments", label: "學期評量" },
  { href: "/notify", label: "LINE 通知" },
  { href: "/users", label: "帳號管理" },
];

export default function NavBar() {
  const pathname = usePathname();
  const router = useRouter();
  const { dept, setDept } = useDepartment();
  const [open, setOpen] = useState(false);

  if (pathname.startsWith("/report") || pathname.startsWith("/assessment")) return null;

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="bg-blue-900 text-white shadow-lg sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-3 py-2 md:px-4 md:py-3 flex items-center gap-2">
        <span className="text-base font-bold mr-1 md:mr-3 whitespace-nowrap">才藝課管理</span>
        <button
          onClick={() => setOpen((v) => !v)}
          className="ml-auto rounded-lg border border-blue-700 px-3 py-2 text-sm font-medium text-blue-100 md:hidden"
          aria-expanded={open}
          aria-label="切換選單"
        >
          ☰
        </button>
        <nav className="hidden md:flex gap-1 overflow-x-auto flex-1">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                pathname === n.href ? "bg-white text-blue-900" : "text-blue-100 hover:bg-blue-800 hover:text-white"
              }`}
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <button onClick={logout} className="hidden md:block text-blue-200 hover:text-white text-sm ml-2 whitespace-nowrap transition-colors">
          登出
        </button>
      </div>
      {open && (
        <nav className="grid grid-cols-2 gap-2 border-t border-blue-800 px-3 py-3 md:hidden">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              onClick={() => setOpen(false)}
              className={`rounded-lg px-3 py-3 text-sm font-medium transition-colors ${
                pathname === n.href ? "bg-white text-blue-900" : "bg-blue-800/70 text-blue-50"
              }`}
            >
              {n.label}
            </Link>
          ))}
          <button onClick={logout} className="col-span-2 rounded-lg bg-blue-800/70 px-3 py-3 text-left text-sm font-medium text-blue-100">
            登出
          </button>
        </nav>
      )}
      <div className="max-w-7xl mx-auto px-3 md:px-4 pb-1 flex gap-1 overflow-x-auto">
        <button
          onClick={() => setDept("")}
          className={`px-3 py-0.5 rounded-t text-xs font-medium transition-colors ${
            dept === "" ? "bg-white text-blue-900" : "text-blue-200 hover:text-white"
          }`}
        >
          全部
        </button>
        {DEPARTMENTS.map((d) => (
          <button
            key={d}
            onClick={() => setDept(d)}
            className={`px-3 py-0.5 rounded-t text-xs font-medium transition-colors ${
              dept === d ? "bg-white text-blue-900" : "text-blue-200 hover:text-white"
            }`}
          >
            {d}
          </button>
        ))}
      </div>
    </header>
  );
}
