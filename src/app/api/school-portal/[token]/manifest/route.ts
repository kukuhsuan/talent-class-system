import { NextRequest, NextResponse } from "next/server";

// 園所看板專屬 PWA manifest：加入主畫面後直接開啟該園所的看板頁
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const manifest = {
    name: "WaysLeader 園所看板",
    short_name: "園所看板",
    description: "課程、出勤、回報、評分與請款一站查看",
    start_url: `/school-portal/${encodeURIComponent(token)}`,
    scope: "/school-portal/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f8fafc",
    theme_color: "#253b8f",
    lang: "zh-TW",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
  return NextResponse.json(manifest, {
    headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=3600" },
  });
}
