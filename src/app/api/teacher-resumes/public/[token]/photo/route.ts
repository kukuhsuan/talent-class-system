import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { put } from "@vercel/blob";
import { verifyTeacherResumeToken } from "@/lib/publicAccessToken";

export const runtime = "nodejs";

type Params = { token: string } | Promise<{ token: string }>;

function blobToken() {
  return process.env.BLOB_READ_WRITE_TOKEN ?? process.env.VERCEL_BLOB_READ_WRITE_TOKEN ?? "";
}

function imageExtension(type: string) {
  if (type.includes("png")) return "png";
  if (type.includes("webp")) return "webp";
  return "jpg";
}

export async function POST(req: NextRequest, { params }: { params: Params }) {
  try {
    const { token } = await params;
    verifyTeacherResumeToken(decodeURIComponent(token));

    const uploadToken = blobToken();
    if (!uploadToken) {
      return NextResponse.json({ error: "尚未設定圖片儲存空間，請聯繫行政。" }, { status: 501 });
    }

    const form = await req.formData();
    const file = form.get("photo");
    if (!(file instanceof File)) return NextResponse.json({ error: "請選擇老師照片" }, { status: 400 });
    if (!file.type.startsWith("image/")) return NextResponse.json({ error: "只支援圖片檔案" }, { status: 400 });
    if (file.size > 2 * 1024 * 1024) return NextResponse.json({ error: "照片請小於 2MB" }, { status: 413 });

    const ext = imageExtension(file.type);
    const pathname = `teacher-resumes/${crypto.randomUUID()}.${ext}`;
    const blob = await put(pathname, file, { access: "public", addRandomSuffix: true, token: uploadToken });
    return NextResponse.json({ url: blob.url });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message || "照片上傳失敗" }, { status: 400 });
  }
}
