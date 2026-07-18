import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveSchoolPortalParam } from "@/lib/schoolPortalAccess";

// 園所看板專屬 PWA manifest：加入主畫面後直接開啟該園所頁
// 安親班使用「運動班長」品牌，幼兒園維持原品牌
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let isAfterSchool = false;
  try {
    const { schoolId } = await resolveSchoolPortalParam(token);
    const school = await prisma.school.findUnique({ where: { id: schoolId }, select: { type: true } });
    isAfterSchool = String(school?.type ?? "").includes("安親");
  } catch { /* 連結無效時回傳預設 manifest */ }

  const manifest = isAfterSchool
    ? {
        name: "運動班長｜安親班課程服務平台",
        short_name: "運動班長",
        description: "課程成果、申請異動與課程評分",
        start_url: `/school-portal/${encodeURIComponent(token)}`,
        scope: "/school-portal/",
        display: "standalone",
        orientation: "portrait",
        background_color: "#F5F7FA",
        theme_color: "#1F3A6D",
        lang: "zh-TW",
        icons: [
          { src: "/sports-leader-icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/sports-leader-icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "/sports-leader-icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      }
    : {
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
    headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=3600", "X-Robots-Tag": "noindex, nofollow" },
  });
}
