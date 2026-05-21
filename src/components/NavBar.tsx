"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useDepartment, DEPARTMENTS } from "@/lib/departmentContext";

const PRIMARY = [
  { href: "/", label: "今日概況" },
  { href: "/schedule", label: "週課表" },
  { href: "/attendance", label: "出勤紀錄" },
  { href: "/courses", label: "課程排班" },
  { href: "/assessments", label: "學期評量" },
];

const GROUPS = [
  {
    title: "今日工作",
    items: [
      { href: "/", label: "今日概況" },
      { href: "/schedule", label: "週課表" },
      { href: "/attendance", label: "出勤紀錄" },
      { href: "/", label: "待處理提醒" },
    ],
  },
  {
    title: "課程管理",
    items: [
      { href: "/courses", label: "課程排班" },
      { href: "/progress", label: "課程進度" },
      { href: "/substitutes", label: "代課紀錄" },
    ],
  },
  {
    title: "園所管理",
    items: [
      { href: "/schools", label: "園所管理" },
      { href: "/school-stats", label: "園所人數" },
      { href: "/notify", label: "LINE 通知" },
    ],
  },
  {
    title: "老師管理",
    items: [
      { href: "/teachers", label: "老師管理" },
      { href: "/salary", label: "薪資計算" },
    ],
  },
  {
    title: "學期成果",
    items: [
      { href: "/assessments", label: "學期評量" },
      { href: "/assessments", label: "AI 發展報告" },
      { href: "/assessments", label: "證書管理" },
    ],
  },
  {
    title: "系統設定",
    items: [
      { href: "/users", label: "帳號管理" },
    ],
  },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function NavBar() {
  const pathname = usePathname();
  const router = useRouter();
  const { dept, setDept } = useDepartment();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  if (pathname.startsWith("/report") || pathname.startsWith("/assessment/") || pathname.startsWith("/school-portal")) return null;

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-50 bg-blue-900 text-white shadow-lg">
      <div className="mx-auto flex max-w-7xl items-center gap-2 px-3 py-2 md:px-4 md:py-3">
        <Link href="/" className="mr-1 whitespace-nowrap text-base font-bold md:mr-3">才藝課管理</Link>
        <button
          onClick={() => setMobileOpen((v) => !v)}
          className="ml-auto rounded-lg border border-blue-700 px-3 py-2 text-sm font-medium text-blue-100 md:hidden"
          aria-expanded={mobileOpen}
          aria-label="切換選單"
        >
          ☰
        </button>

        <nav className="hidden flex-1 items-center gap-1 overflow-visible md:flex">
          {PRIMARY.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                isActive(pathname, n.href) ? "bg-white text-blue-900" : "text-blue-100 hover:bg-blue-800 hover:text-white"
              }`}
            >
              {n.label}
            </Link>
          ))}
          <div className="relative">
            <button
              onClick={() => setMoreOpen((v) => !v)}
              className="whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium text-blue-100 transition-colors hover:bg-blue-800 hover:text-white"
            >
              更多 ▾
            </button>
            {moreOpen && (
              <div className="absolute left-0 top-10 z-50 grid w-[680px] grid-cols-3 gap-3 rounded-2xl border border-blue-100 bg-white p-4 text-slate-700 shadow-xl">
                {GROUPS.map((group) => (
                  <div key={group.title}>
                    <div className="mb-2 text-xs font-bold tracking-wide text-slate-400">{group.title}</div>
                    <div className="space-y-1">
                      {group.items.map((item) => (
                        <Link
                          key={`${group.title}-${item.label}`}
                          href={item.href}
                          onClick={() => setMoreOpen(false)}
                          className={`block rounded-lg px-3 py-2 text-sm font-medium ${
                            isActive(pathname, item.href) ? "bg-blue-50 text-blue-700" : "hover:bg-slate-50"
                          }`}
                        >
                          {item.label}
                        </Link>
                      ))}
                    </div>
                  </div>
                ))}
                <button onClick={logout} className="col-span-3 rounded-lg bg-slate-100 px-3 py-2 text-left text-sm font-semibold text-slate-700 hover:bg-slate-200">
                  登出
                </button>
              </div>
            )}
          </div>
        </nav>

        <button onClick={logout} className="hidden whitespace-nowrap text-sm text-blue-200 transition-colors hover:text-white md:block">
          登出
        </button>
      </div>

      {mobileOpen && (
        <nav className="space-y-4 border-t border-blue-800 px-3 py-3 md:hidden">
          {GROUPS.map((group) => (
            <div key={group.title} className="rounded-2xl bg-blue-950/25 p-3">
              <div className="mb-2 text-xs font-bold tracking-wide text-blue-200">{group.title}</div>
              <div className="grid grid-cols-2 gap-2">
                {group.items.map((item) => (
                  <Link
                    key={`${group.title}-${item.label}`}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className={`rounded-lg px-3 py-3 text-sm font-medium transition-colors ${
                      isActive(pathname, item.href) ? "bg-white text-blue-900" : "bg-blue-800/70 text-blue-50"
                    }`}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            </div>
          ))}
          <button onClick={logout} className="w-full rounded-lg bg-blue-800/70 px-3 py-3 text-left text-sm font-medium text-blue-100">
            登出
          </button>
        </nav>
      )}

      <div className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-3 pb-1 md:px-4">
        <button
          onClick={() => setDept("")}
          className={`rounded-t px-3 py-0.5 text-xs font-medium transition-colors ${
            dept === "" ? "bg-white text-blue-900" : "text-blue-200 hover:text-white"
          }`}
        >
          全部
        </button>
        {DEPARTMENTS.map((d) => (
          <button
            key={d}
            onClick={() => setDept(d)}
            className={`rounded-t px-3 py-0.5 text-xs font-medium transition-colors ${
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
