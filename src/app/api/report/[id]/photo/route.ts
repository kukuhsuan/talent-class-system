import { reportMaintenanceResponse } from "@/lib/reportMaintenance";
import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import sharp from "sharp";
import { reportPhotoToken, deleteReportPhoto } from "@/lib/reportPhotoStorage";
import { get, put } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { verifyReportAccessToken } from "@/lib/publicAccessToken";
import { attendanceScheduledTimeMap, effectiveAttendanceTime } from "@/lib/attendanceTime";
import { attendanceReportWindow, REPORT_LINK_EXPIRED_MESSAGE } from "@/lib/reportWindow";

export const runtime = "nodejs";

const REPORT_PHOTO_LIMIT = 4; // 每堂課照片上限（route 檔不可任意 export，勿改成 export）

// 解析 reportPhotos 欄位（JSON 陣列字串；相容舊資料的單一字串）
function parseStoredPhotos(raw: string): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map((item) => String(item)).filter(Boolean);
  } catch {
    // 舊資料可能是單一網址字串
  }
  return raw.trim() ? [raw.trim()] : [];
}

// 儲存值轉成前端可用的網址（私有照片走代理連結）
function storedToUrl(stored: string, tokenParam: string) {
  if (stored.startsWith("private:")) {
    return `/api/report/${encodeURIComponent(tokenParam)}/photo?path=${encodeURIComponent(stored.slice("private:".length))}`;
  }
  return stored;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { attendanceId } = verifyReportAccessToken(decodeURIComponent(id));
    const pathname = req.nextUrl.searchParams.get("path") ?? "";
    if (!pathname.startsWith("report-photos/")) {
      return NextResponse.json({ error: "照片路徑不正確" }, { status: 400 });
    }

    const attendance = await prisma.attendance.findUnique({
      where: { id: attendanceId },
      select: { reportPhotos: true },
    });
    const first = `private:${pathname}`;
    if (!parseStoredPhotos(String(attendance?.reportPhotos ?? "")).includes(first)) {
      return NextResponse.json({ error: "找不到照片" }, { status: 404 });
    }
    // 新資料：私有照片透過代理串流，不暴露公開網址
    if (first.startsWith("private:")) {
      const blob = await get(first.slice("private:".length), { access: "private", token: reportPhotoToken(), useCache: false });
      if (!blob?.stream) return NextResponse.json({ error: "找不到照片" }, { status: 404 });
      return new NextResponse(blob.stream as BodyInit, {
        headers: {
          "Content-Type": blob.blob.contentType ?? "image/jpeg",
          "Cache-Control": "private, no-store",
          "Content-Security-Policy": "default-src 'none'; sandbox",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
    return NextResponse.json({ error: "照片連結格式不支援，請重新上傳" }, { status: 404 });
  } catch (e) {
    if ((e as Error).message.includes("token") || (e as Error).message.includes("Expired")) {
      return NextResponse.json({ error: "回報連結無效或已過期" }, { status: 401 });
    }
    console.error("report photo load failed", e);
    return NextResponse.json({ error: "照片讀取失敗" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const maintenance = reportMaintenanceResponse();
  if (maintenance) return maintenance;
  try {
    const { id } = await params;
    const { attendanceId, reportRole } = verifyReportAccessToken(decodeURIComponent(id));
    if (reportRole !== "lead") return NextResponse.json({ error: "助教連結只能回填人數，無法修改照片" }, { status: 403 });
    if (!Number.isFinite(attendanceId)) {
      return NextResponse.json({ error: "回報連結不正確" }, { status: 400 });
    }

    const token = reportPhotoToken();
    if (!token) {
      return NextResponse.json(
        { error: "圖片上傳尚未啟用，請聯繫行政人員。" },
        { status: 501 },
      );
    }

    const attendance = await prisma.attendance.findUnique({
      where: { id: attendanceId },
      include: { course: { select: { time: true } } },
    });
    if (!attendance) {
      return NextResponse.json({ error: "找不到課程回報資料，可能這筆出勤已刪除或連結已失效" }, { status: 404 });
    }
    const timeMap = await attendanceScheduledTimeMap([attendance.id]);
    const scheduledTime = effectiveAttendanceTime({
      scheduledTime: timeMap.get(attendance.id),
      courseTime: attendance.course.time,
      attendanceHours: attendance.hours,
      isPayrollLocked: attendance.isPayrollLocked,
      reportContent: attendance.reportContent,
      reportSentAt: attendance.reportSentAt,
      studentCount: attendance.studentCount,
      studentCountA: attendance.studentCountA,
      studentCountB: attendance.studentCountB,
    });
    const reportWindow = attendanceReportWindow(attendance, scheduledTime);
    if (reportWindow.expired && !reportWindow.complete) {
      return NextResponse.json({ error: REPORT_LINK_EXPIRED_MESSAGE }, { status: 410 });
    }

    const existingPhotos = parseStoredPhotos(String(attendance.reportPhotos ?? ""));
    if (existingPhotos.length >= REPORT_PHOTO_LIMIT) {
      return NextResponse.json({ error: `每堂課最多上傳 ${REPORT_PHOTO_LIMIT} 張照片，請先移除一張再上傳` }, { status: 409 });
    }

    const form = await req.formData();
    const file = form.get("photo");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "請選擇一張活動照片" }, { status: 400 });
    }
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      return NextResponse.json({ error: "只支援 JPG、PNG 或 WebP 圖片" }, { status: 400 });
    }
    if (file.size === 0 || file.size > 900 * 1024) {
      return NextResponse.json({ error: "圖片仍然太大，請重新選擇或稍後再試" }, { status: 413 });
    }

    // Decode and re-encode raster pixels: do not trust browser MIME or preserve
    // SVG/HTML payloads or embedded metadata in the same-origin image endpoint.
    const input = Buffer.from(await file.arrayBuffer());
    let image: Buffer;
    try {
      const metadata = await sharp(input, { limitInputPixels: 20_000_000 }).metadata();
      if (!["jpeg", "png", "webp"].includes(metadata.format ?? "")) throw new Error("Unsupported format");
      image = await sharp(input, { limitInputPixels: 20_000_000 }).rotate().jpeg({ quality: 85 }).toBuffer();
    } catch {
      return NextResponse.json({ error: "圖片內容無效，請重新選擇 JPG、PNG 或 WebP 照片" }, { status: 400 });
    }
    const pathname = `report-photos/${crypto.randomUUID()}.jpg`;
    // Storage misconfiguration must fail closed; never retry with public access.
    const blob = await put(pathname, image, { access: "private", addRandomSuffix: true, token, contentType: "image/jpeg" });
    const stored = `private:${blob.pathname}`;
    const responseUrl = `/api/report/${encodeURIComponent(id)}/photo?path=${encodeURIComponent(blob.pathname)}`;

    // 附加到既有照片陣列（不再覆蓋），上限 4 張
    const updatedPhotos = [...existingPhotos, stored].slice(0, REPORT_PHOTO_LIMIT);
    await prisma.attendance.update({
      where: { id: attendanceId },
      data: { reportPhotos: JSON.stringify(updatedPhotos) },
    });

    return NextResponse.json({
      ok: true,
      url: responseUrl,
      photoUrls: updatedPhotos.map((item) => storedToUrl(item, id)),
    });
  } catch (e) {
    if ((e as Error).message.includes("token") || (e as Error).message.includes("Expired")) {
      return NextResponse.json({ error: "回報連結無效或已過期" }, { status: 401 });
    }
    console.error("report photo upload failed", e);
    return NextResponse.json({ error: "照片上傳失敗，請稍後重試或聯繫行政人員" }, { status: 500 });
  }
}

// 刪除單張照片（以代理連結或公開網址指定）
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const maintenance = reportMaintenanceResponse();
  if (maintenance) return maintenance;
  try {
    const { id } = await params;
    const { attendanceId, reportRole } = verifyReportAccessToken(decodeURIComponent(id));
    if (reportRole !== "lead") return NextResponse.json({ error: "助教連結只能回填人數，無法修改照片" }, { status: 403 });
    const body = await req.json().catch(() => ({}));
    const target = String(body.url ?? "").trim();
    if (!target) return NextResponse.json({ error: "請指定要移除的照片" }, { status: 400 });

    const attendance = await prisma.attendance.findUnique({
      where: { id: attendanceId },
      include: { course: { select: { time: true } } },
    });
    if (!attendance) return NextResponse.json({ error: "找不到課程回報資料" }, { status: 404 });

    const timeMap = await attendanceScheduledTimeMap([attendance.id]);
    const scheduledTime = effectiveAttendanceTime({
      scheduledTime: timeMap.get(attendance.id),
      courseTime: attendance.course.time,
      attendanceHours: attendance.hours,
      isPayrollLocked: attendance.isPayrollLocked,
      reportContent: attendance.reportContent,
      reportSentAt: attendance.reportSentAt,
      studentCount: attendance.studentCount,
      studentCountA: attendance.studentCountA,
      studentCountB: attendance.studentCountB,
    });
    const reportWindow = attendanceReportWindow(attendance, scheduledTime);
    if (reportWindow.expired && !reportWindow.complete) {
      return NextResponse.json({ error: REPORT_LINK_EXPIRED_MESSAGE }, { status: 410 });
    }

    const existingPhotos = parseStoredPhotos(String(attendance.reportPhotos ?? ""));
    const remaining = existingPhotos.filter((stored) => storedToUrl(stored, id) !== target && stored !== target);
    if (remaining.length === existingPhotos.length) {
      return NextResponse.json({ error: "找不到這張照片，可能已被移除" }, { status: 404 });
    }
    const removed = existingPhotos.filter((stored) => !remaining.includes(stored));
    for (const stored of removed) await deleteReportPhoto(stored);
    await prisma.attendance.update({
      where: { id: attendanceId },
      data: { reportPhotos: JSON.stringify(remaining) },
    });
    return NextResponse.json({ ok: true, photoUrls: remaining.map((item) => storedToUrl(item, id)) });
  } catch (e) {
    if ((e as Error).message.includes("token") || (e as Error).message.includes("Expired")) {
      return NextResponse.json({ error: "回報連結無效或已過期" }, { status: 401 });
    }
    console.error("report photo delete failed", e);
    return NextResponse.json({ error: "照片移除失敗，請稍後再試" }, { status: 500 });
  }
}
