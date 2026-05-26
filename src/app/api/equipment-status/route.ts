import { NextRequest, NextResponse } from "next/server";
import { createEquipmentStatus, listEquipmentStatuses } from "@/lib/equipmentStatus";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const schoolId = Number(searchParams.get("schoolId") ?? 0) || null;
  const school = searchParams.get("school") ?? "";
  const rows = await listEquipmentStatuses({ schoolId, school });
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const data = await req.json();
  const name = String(data.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "請填寫器材名稱" }, { status: 400 });

  await createEquipmentStatus({
    schoolId: data.schoolId ? Number(data.schoolId) : null,
    school: String(data.school ?? "").trim(),
    name,
    quantity: String(data.quantity ?? "").trim(),
    status: String(data.status ?? "正常").trim(),
    notes: String(data.notes ?? "").trim(),
    sortOrder: Number(data.sortOrder ?? 0),
  });

  return NextResponse.json({ ok: true });
}
