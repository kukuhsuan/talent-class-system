import { NextRequest, NextResponse } from "next/server";
import { get } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { resolveSchoolPortalParam } from "@/lib/schoolPortalAccess";

function blobToken() {
  return process.env.BLOB_READ_WRITE_TOKEN ?? process.env.VERCEL_BLOB_READ_WRITE_TOKEN ?? "";
}

function includesPrivatePhoto(value: string | null | undefined, pathname: string) {
  const raw = String(value ?? "").trim();
  if (!raw) return false;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.includes(`private:${pathname}`);
  } catch {
    return raw === `private:${pathname}`;
  }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const { schoolId } = await resolveSchoolPortalParam(token);
    const pathname = req.nextUrl.searchParams.get("path") ?? "";
    if (!pathname.startsWith("report-photos/")) {
      return NextResponse.json({ error: "照片路徑不正確" }, { status: 400 });
    }

    const school = await prisma.school.findUnique({ where: { id: schoolId }, select: { name: true } });
    if (!school) return NextResponse.json({ error: "找不到園所" }, { status: 404 });

    const attendance = await prisma.attendance.findFirst({
      where: {
        reportPhotos: { contains: `private:${pathname}` },
        course: { OR: [{ schoolId }, { school: school.name }] },
      } as never,
      select: { reportPhotos: true },
    });
    if (!includesPrivatePhoto(attendance?.reportPhotos, pathname)) {
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
  } catch {
    return NextResponse.json({ error: "園所連結無效或已過期" }, { status: 401 });
  }
}
