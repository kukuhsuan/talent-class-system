"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const NAV = [
  { href: "/", label: "今日概況" },
  { href: "/schedule", label: "週課表" },
  { href: "/attendance", label: "出勤紀錄" },
  { href: "/teachers", label: "老師管理" },
  { href: "/courses", label: "課程排班" },
  { href: "/schools", label: "園所管理" },
  { href: "/substitutes", label: "代課紀錄" },
  { href: "/salary", label: "薪資計算" },
];

export default function NavBar() {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="bg-blue-900 text-white shadow-lg sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-2">
        <span className="text-base font-bold mr-3 whitespace-nowrap">才藝課管理</span>
        <nav className="flex gap-1 overflow-x-auto flex-1">
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
        <button onClick={logout} className="text-blue-200 hover:text-white text-sm ml-2 whitespace-nowrap transition-colors">
          登出
        </button>
      </div>
    </header>
  );
}
