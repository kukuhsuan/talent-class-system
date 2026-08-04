import type { Metadata } from "next";

// 老師專用教學課表：不讓搜尋引擎收錄
export const metadata: Metadata = {
  title: "教學課表",
  robots: { index: false, follow: false },
};

export default function LessonPlanLayout({ children }: { children: React.ReactNode }) {
  return children;
}
