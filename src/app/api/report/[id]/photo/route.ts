import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { get, put } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { verifyPublicAccessToken } from "@/lib/publicAccessToken";
import { attendanceScheduledTimeMap, effectiveAttendanceTime } from "@/lib/attendanceTime";
import { attendanceReportWindow, REPORT_LINK_EXPIRED_MESSAGE } from "@/lib/reportWindow";

export const runtime = "nodejs";

function blobToken() {
  return process.env.BLOB_READ_WRITE_TOKEN ?? process.env.VERCEL_BLOB_READ_WRITE_TOKEN ?? "";
}

function imageExtension(type: string) {
  if (type.includes("png")) return "png";
  if (type.includes("webp")) return "webp";
  return "jpg";
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { attendanceId } = verifyPublicAccessToken(decodeURIComponent(id), "report");
    const pathname = req.nextUrl.searchParams.get("path") ?? "";
    if (!pathname.startsWith("report-photos/")) {
      return NextResponse.json({ error: "照片路徑不正確" }, { status: 400 });
    }

    const attendance = await prisma.attendance.findUnique({
      where: { id: attendanceId },
      select: { reportPhotos: true },
    });
    const raw = String(attendance?.reportPhotos ?? "");
    if (!raw.includes(pathname)) {
      return NextResponse.json({ error: "找不到照片" }, { status: 404 });
    }

    let first = "";
    try {
      const parsed = JSON.parse(raw);
      first = Array.isArray(parsed) ? String(parsed.find((item) => String(item).includes(pathname)) ?? "") : "";
    } catch {
      first = raw;
    }
    // 舊資料：公開網址直接導向（相容既有照片）
    if (first.startsWith("http://") || first.startsWith("https://")) return NextResponse.redirect(first);
    // 新資料：私有照片透過代理串流，不暴露公開網址
    if (first.startsWith("private:")) {
      const blob = await get(first.slice("private:".length), { access: "private", token: blobToken() });
      if (!blob?.stream) return NextResponse.json({ error: "找不到照片" }, { status: 404 });
      return new NextResponse(blob.stream as BodyInit, {
        headers: {
          "Content-Type": blob.blob.contentType ?? "image/jpeg",
          "Cache-Control": "private, max-age=300",
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
  try {
    const { id } = await params;
    const { attendanceId } = verifyPublicAccessToken(decodeURIComponent(id), "report");
    if (!Number.isFinite(attendanceId)) {
      return NextResponse.json({ error: "回報連結不正確" }, { status: 400 });
    }

    const token = blobToken();
    if (!token) {
      return NextResponse.json(
        { error: "尚未設定圖片儲存空間，請先在 Vercel Storage 建立 Blob 並設定 BLOB_READ_WRITE_TOKEN。" },
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

    const form = await req.formData();
    const file = form.get("photo");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "請選擇一張代表照片" }, { status: 400 });
    }
    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ error: "只支援圖片檔案" }, { status: 400 });
    }
    if (file.size > 900 * 1024) {
      return NextResponse.json({ error: "圖片仍然太大，請重新選擇或稍後再試" }, { status: 413 });
    }

    const ext = imageExtension(file.type);
    const pathname = `report-photos/${crypto.randomUUID()}.${ext}`;
    // 優先私有上傳（照片只能透過帶 token 的代理連結讀取）；
    // 若 Blob store 是公開型（不支援 private），改用公開上傳存公開網址。
    let stored = "";
    let responseUrl = "";
    try {
      const blob = await put(pathname, file, { access: "private", addRandomSuffix: true, token });
      stored = `private:${blob.pathname}`;
      responseUrl = `/api/report/${encodeURIComponent(id)}/photo?path=${encodeURIComponent(blob.pathname)}`;
    } catch (err) {
      const message = (err as Error).message ?? "";
      if (!/private access|public store/i.test(message)) throw err;
      const blob = await put(pathname, file, { access: "public", addRandomSuffix: true, token });
      stored = blob.url;
      responseUrl = blob.url;
    }

    await prisma.attendance.update({
      where: { id: attendanceId },
      data: { reportPhotos: JSON.stringify([stored]) },
    });

    return NextResponse.json({ ok: true, url: responseUrl });
  } catch (e) {
    if ((e as Error).message.includes("token") || (e as Error).message.includes("Expired")) {
      return NextResponse.json({ error: "回報連結無效或已過期" }, { status: 401 });
    }
    console.error("report photo upload failed", e);
    return NextResponse.json({ error: `照片上傳失敗：${(e as Error).message}` }, { status: 500 });
  }
}
