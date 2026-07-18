import type { Metadata } from "next";

// 園所端專屬連結：不讓搜尋引擎收錄
export const metadata: Metadata = {
  title: "園所課程服務平台",
  robots: { index: false, follow: false },
};

export default function SchoolPortalLayout({ children }: { children: React.ReactNode }) {
  return children;
}
