import type { Metadata } from "next";

// 評分專屬連結：不讓搜尋引擎收錄
export const metadata: Metadata = {
  title: "課程評分", // 安親班／幼兒園共用，品牌改在頁面內依課程顯示
  robots: { index: false, follow: false },
};

export default function RatingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
