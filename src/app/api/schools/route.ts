import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizeDepartment, normalizeRegion } from "@/lib/courseMeta";

export async function GET() {
  const schools = await prisma.school.findMany({ orderBy: [{ region: "asc" }, { name: "asc" }] });
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
    },
  });
  return NextResponse.json(school);
}
