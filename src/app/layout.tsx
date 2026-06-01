import type { Metadata, Viewport } from "next";
import "./globals.css";
import NavBar from "@/components/NavBar";
import PwaRegister from "@/components/PwaRegister";
import { DepartmentProvider } from "@/lib/departmentContext";

export const metadata: Metadata = {
  title: "WaysLeader AI｜幼兒園學習成果平台",
  description: "AI 幼兒園學習成果平台，整合孩子成長、課程進度與園所成果展示。",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "WaysLeader AI",
    statusBarStyle: "default",
  },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#253b8f",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-TW" className="h-full">
      <body className="min-h-full flex flex-col bg-slate-50">
        <DepartmentProvider>
        <NavBar />
        <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-6">{children}</main>
        </DepartmentProvider>
        <footer className="text-center text-xs text-slate-400 py-4">WaysLeader AI｜幼兒園學習成果平台</footer>
        <PwaRegister />
      </body>
    </html>
  );
}
