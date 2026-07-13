"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useDepartment, DEPARTMENTS } from "@/lib/departmentContext";

const OWNER_ROLES = new Set(["owner", "super_admin", "developer"]);

const PRIMARY = [
  { href: "/", label: "今日概況" },
  { href: "/schedule", label: "週課表" },
  { href: "/attendance", label: "出勤紀錄" },
  { href: "/courses", label: "課程排班" },
  { href: "/assessments", label: "學期評量" },
];

const GROUPS = [
  {
    title: "日常作業",
    items: [
      { href: "/", label: "今日概況" },
      { href: "/schedule", label: "週課表" },
      { href: "/attendance", label: "出勤紀錄" },
    ],
  },
  {
    title: "課務管理",
    items: [
      { href: "/courses", label: "課程排班" },
      { href: "/course-change-requests", label: "課程異動申請" },
      { href: "/progress", label: "課程進度" },
      { href: "/teacher-leaves", label: "老師請假" },
      { href: "/substitutes", label: "代課紀錄" },
      { href: "/equipment", label: "器材管理" },
    ],
  },
  {
    title: "人員與成果",
    items: [
      { href: "/teachers", label: "老師管理" },
      { href: "/teacher-resumes", label: "老師簡歷" },
      { href: "/recruitment", label: "全民招募" },
      { href: "/assessments", label: "評量、報告與證書" },
      { href: "/salary", label: "薪資計算" },
    ],
  },
  {
    title: "園所與系統",
    items: [
      { href: "/schools", label: "園所管理" },
      { href: "/school-stats", label: "園所人數" },
      { href: "/school-invoices", label: "園所請款單" },
      { href: "/notify", label: "LINE 通知" },
      { href: "/alerts", label: "異常管理", ownerOnly: true },
      { href: "/users", label: "帳號管理" },
      { href: "/admin/audit-logs", label: "操作歷程" },
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
  const [isOwner, setIsOwner] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled) setIsOwner(OWNER_ROLES.has(String(data?.role ?? "")));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!moreOpen) return;
    function closeMenu(event: MouseEvent) {
      if (!moreMenuRef.current?.contains(event.target as Node)) setMoreOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setMoreOpen(false);
    }
    document.addEventListener("mousedown", closeMenu);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeMenu);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [moreOpen]);

  const visibleGroups = GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => !("ownerOnly" in item && item.ownerOnly) || isOwner),
  })).filter((group) => group.items.length > 0);

  if (
    pathname.startsWith("/report")
    || pathname.startsWith("/assessment/")
    || pathname.startsWith("/school-portal")
    || pathname.startsWith("/recruitment/")
    || pathname.startsWith("/teacher-resume/")
    || pathname.startsWith("/teacher-card/")
  ) return null;

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-50 bg-blue-900 text-white shadow-lg">
      <div className="mx-auto flex max-w-7xl items-center gap-2 px-3 py-2 md:px-4 md:py-3">
        <Link href="/" className="mr-1 whitespace-nowrap md:mr-3">
          <span className="block text-base font-bold leading-tight">WaysLeader AI</span>
          <span className="hidden text-[11px] font-medium leading-tight text-blue-200 lg:block">幼兒園學習成果平台</span>
        </Link>
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
          <div ref={moreMenuRef} className="relative">
            <button
              onClick={() => setMoreOpen((v) => !v)}
              aria-expanded={moreOpen}
              aria-haspopup="menu"
              className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${moreOpen ? "bg-blue-800 text-white" : "text-blue-100 hover:bg-blue-800 hover:text-white"}`}
            >
              更多 ▾
            </button>
            {moreOpen && (
              <div role="menu" className="fixed left-1/2 top-[62px] z-50 grid w-[min(880px,calc(100vw-2rem))] -translate-x-1/2 grid-cols-4 gap-2 rounded-2xl border border-slate-200 bg-white p-3 text-slate-700 shadow-2xl">
                {visibleGroups.map((group) => (
                  <div key={group.title} className="rounded-xl bg-slate-50/80 p-2">
                    <div className="mb-1 px-2 py-1 text-[11px] font-bold tracking-wider text-slate-400">{group.title}</div>
                    <div className="space-y-0.5">
                      {group.items.map((item) => (
                        <Link
                          key={`${group.title}-${item.label}`}
                          href={item.href}
                          onClick={() => setMoreOpen(false)}
                          role="menuitem"
                          className={`block rounded-lg px-2 py-1.5 text-[13px] font-medium transition-colors ${
                            isActive(pathname, item.href) ? "bg-blue-100 text-blue-800" : "text-slate-700 hover:bg-white hover:text-blue-700 hover:shadow-sm"
                          }`}
                        >
                          {item.label}
                        </Link>
                      ))}
                    </div>
                  </div>
                ))}
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
          {visibleGroups.map((group) => (
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
