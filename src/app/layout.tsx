import type { Metadata } from "next";
import "./globals.css";
import Link from "next/link";

export const metadata: Metadata = {
  title: "才藝課管理系統",
  description: "幼兒園才藝課管理系統",
};

const NAV = [
  { href: "/", label: "首頁", icon: "🏠" },
  { href: "/teachers", label: "老師管理", icon: "👩‍🏫" },
  { href: "/courses", label: "課程排班", icon: "📚" },
  { href: "/attendance", label: "上課紀錄", icon: "✏️" },
  { href: "/substitutes", label: "代課紀錄", icon: "🔄" },
  { href: "/salary", label: "薪資計算", icon: "💰" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-TW" className="h-full">
      <body className="min-h-full flex flex-col bg-slate-50">
        <header className="bg-blue-900 text-white shadow-lg sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-2">
            <span className="text-lg font-bold mr-4">才藝課管理系統</span>
            <nav className="flex gap-1 overflow-x-auto">
              {NAV.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium text-blue-100 hover:bg-blue-800 hover:text-white transition-colors whitespace-nowrap"
                >
                  <span>{n.icon}</span>
                  <span>{n.label}</span>
                </Link>
              ))}
            </nav>
          </div>
        </header>
        <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-6">{children}</main>
        <footer className="text-center text-xs text-slate-400 py-4">才藝課管理系統</footer>
      </body>
    </html>
  );
}
