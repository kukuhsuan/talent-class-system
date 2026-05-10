import type { Metadata } from "next";
import "./globals.css";
import NavBar from "@/components/NavBar";
import { DepartmentProvider } from "@/lib/departmentContext";

export const metadata: Metadata = {
  title: "才藝課管理系統",
  description: "幼兒園才藝課管理系統",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-TW" className="h-full">
      <body className="min-h-full flex flex-col bg-slate-50">
        <DepartmentProvider>
        <NavBar />
        <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-6">{children}</main>
        </DepartmentProvider>
        <footer className="text-center text-xs text-slate-400 py-4">才藝課管理系統</footer>
      </body>
    </html>
  );
}
