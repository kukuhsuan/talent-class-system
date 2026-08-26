import { NextRequest, NextResponse } from "next/server";
import { getTeacherResume } from "@/lib/teacherResume";
import { verifyTeacherCardToken } from "@/lib/publicAccessToken";
import { currentSessionUser } from "@/lib/permissions";

export const runtime = "nodejs";

type Params = { teacherId: string } | Promise<{ teacherId: string }>;

export async function GET(req: NextRequest, { params }: { params: Params }) {
  const { teacherId } = await params;
  const id = Number(teacherId);
  if (!Number.isFinite(id) || id <= 0) {
    return new NextResponse(null, { status: 400 });
  }

  const token = req.nextUrl.searchParams.get("t")?.trim() ?? "";
  let allowed = false;
  if (token) {
    try {
      allowed = verifyTeacherCardToken(token).teacherId === id;
    } catch {
      allowed = false;
    }
  }
  if (!allowed) {
    const user = await currentSessionUser();
    allowed = Boolean(user?.userId);
  }
  if (!allowed) return new NextResponse(null, { status: 403 });

  const resume = await getTeacherResume(id);
  if (!resume?.photoUrl) return new NextResponse(null, { status: 404 });

  let source: URL;
  try {
    source = new URL(resume.photoUrl);
    if (source.protocol !== "https:" && source.protocol !== "http:") {
      return new NextResponse(null, { status: 404 });
    }
    // 履歷照片只會由 Vercel Blob 上傳。限制來源可避免資料庫內容遭竄改時，
    // 這支同站代理被拿來讀取任意內網網址。
    if (!source.hostname.endsWith(".blob.vercel-storage.com")) {
      return new NextResponse(null, { status: 404 });
    }
  } catch {
    return new NextResponse(null, { status: 404 });
  }

  try {
    const upstream = await fetch(source, { cache: "no-store", redirect: "error" });
    if (!upstream.ok || !upstream.body) return new NextResponse(null, { status: 404 });
    const contentType = upstream.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().startsWith("image/")) {
      return new NextResponse(null, { status: 415 });
    }
    return new NextResponse(upstream.body, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("teacher card photo proxy failed", { teacherId: id, error });
    return new NextResponse(null, { status: 502 });
  }
}
