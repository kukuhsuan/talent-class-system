import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { get, put } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { verifyPublicAccessToken } from "@/lib/publicAccessToken";

export const runtime = "nodejs";

function blobToken() {
  return process.env.BLOB_READ_WRITE_TOKEN ?? process.env.VERCEL_BLOB_READ_WRITE_TOKEN ?? "";
}

function imageExtension(type: string) {
  if (type.includes("png")) return "png";
  if (type.includes("webp")) return "webp";
  return "jpg";
}

function privatePhotoRef(pathname: string) {
  return `private:${pathname}`;
}

function extractPrivatePath(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  try {
    const parsed = JSON.parse(raw);
    const first = Array.isArray(parsed) ? String(parsed[0] ?? "") : "";
    return first.startsWith("private:") ? first.slice("private:".length) : "";
  } catch {
    return raw.startsWith("private:") ? raw.slice("private:".length) : "";
  }
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
    if (extractPrivatePath(attendance?.reportPhotos) !== pathname) {
      return NextResponse.json({ error: "找不到照片" }, { status: 404 });
    }

    const blob = await get(pathname, { access: "private", token: blobToken() });
    if (!blob?.stream) return NextResponse.json({ error: "找不到照片" }, { status: 404 });
    return new NextResponse(blob.stream as BodyInit, {
      headers: {
        "Content-Type": blob.blob.contentType ?? "image/jpeg",
        "Cache-Control": "private, max-age=300",
      },
    });
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
      select: { id: true },
    });
    if (!attendance) {
      return NextResponse.json({ error: "找不到課程回報資料，可能這筆出勤已刪除或連結已失效" }, { status: 404 });
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
    const blob = await put(`report-photos/${crypto.randomUUID()}.${ext}`, file, {
      access: "private",
      addRandomSuffix: true,
      token,
    });

    await prisma.attendance.update({
      where: { id: attendanceId },
      data: { reportPhotos: JSON.stringify([privatePhotoRef(blob.pathname)]) },
    });

    return NextResponse.json({ ok: true, url: `/api/report/${encodeURIComponent(id)}/photo?path=${encodeURIComponent(blob.pathname)}` });
  } catch (e) {
    if ((e as Error).message.includes("token") || (e as Error).message.includes("Expired")) {
      return NextResponse.json({ error: "回報連結無效或已過期" }, { status: 401 });
    }
    console.error("report photo upload failed", e);
    return NextResponse.json({ error: `照片上傳失敗：${(e as Error).message}` }, { status: 500 });
  }
}
