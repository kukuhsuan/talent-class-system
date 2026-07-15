import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { put } from "@vercel/blob";

export const runtime = "nodejs";

function blobToken() {
  return process.env.BLOB_READ_WRITE_TOKEN ?? process.env.VERCEL_BLOB_READ_WRITE_TOKEN ?? "";
}

function extension(type: string) {
  if (type.includes("png")) return "png";
  if (type.includes("webp")) return "webp";
  return "jpg";
}

export async function POST(req: NextRequest) {
  try {
    const token = blobToken();
    if (!token) return NextResponse.json({ error: "尚未設定圖片儲存空間" }, { status: 501 });
    const form = await req.formData();
    const file = form.get("photo");
    if (!(file instanceof File)) return NextResponse.json({ error: "請選擇器材照片" }, { status: 400 });
    if (!file.type.startsWith("image/")) return NextResponse.json({ error: "只支援圖片檔案" }, { status: 400 });
    if (file.size > 3 * 1024 * 1024) return NextResponse.json({ error: "器材照片請小於 3MB" }, { status: 413 });
    const blob = await put(`equipment/${crypto.randomUUID()}.${extension(file.type)}`, file, {
      access: "public",
      addRandomSuffix: true,
      token,
    });
    return NextResponse.json({ url: blob.url });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message || "器材照片上傳失敗" }, { status: 400 });
  }
}
