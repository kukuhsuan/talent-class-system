import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizeDepartment, normalizeRegion } from "@/lib/courseMeta";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const page = Math.max(1, Number(searchParams.get("page") ?? "0") || 0);
  const pageSizeRaw = Number(searchParams.get("pageSize") ?? "0") || 0;
  const pageSize = pageSizeRaw ? Math.min(50, Math.max(20, pageSizeRaw)) : 0;
  const search = (searchParams.get("search") ?? "").trim();
  const region = normalizeRegion(searchParams.get("region") ?? "");
  const type = searchParams.get("type") ? normalizeDepartment(searchParams.get("type") ?? "") : "";
  const where: Record<string, unknown> = {};
  if (region) where.region = region;
  if (type) where.type = type === "未分類" ? "" : type;
  if (search) {
    where.OR = [
      { name: { contains: search } },
      { address: { contains: search } },
      { contact: { contains: search } },
      { phone: { contains: search } },
    ];
  }
  const query = { where, orderBy: [{ region: "asc" }, { name: "asc" }] } as const;
  const [schools, total] = await Promise.all([
    prisma.school.findMany(pageSize ? { ...query, skip: (page - 1) * pageSize, take: pageSize } : query),
    pageSize ? prisma.school.count({ where }) : Promise.resolve(0),
  ]);
  if (pageSize) return NextResponse.json({ items: schools, total, page, pageSize });
  return NextResponse.json(schools);
}

export async function POST(req: NextRequest) {
  const data = await req.json();
  const school = await prisma.school.create({
    data: {
      name: data.name,
      type: data.type ? normalizeDepartment(data.type) : "",
      region: normalizeRegion(data.region),
      address: data.address ?? "",
      phone: data.phone ?? "",
      contact: data.contact ?? "",
      notes: data.notes ?? "",
      lineUserId: data.lineUserId ?? undefined,
      lineBindCode: data.lineBindCode ?? undefined,
    },
  });
  return NextResponse.json(school);
}
