import type { Metadata } from "next";

// 評分專屬連結：不讓搜尋引擎收錄
export const metadata: Metadata = {
  title: "運動班長｜課程評分",
  robots: { index: false, follow: false },
};

export default function RatingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
