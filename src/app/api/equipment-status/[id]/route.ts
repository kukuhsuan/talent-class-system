import { NextRequest, NextResponse } from "next/server";
import { deleteEquipmentStatus, updateEquipmentStatus } from "@/lib/equipmentStatus";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await req.json();
  const name = String(data.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "請填寫器材名稱" }, { status: 400 });

  await updateEquipmentStatus(Number(id), {
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

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await deleteEquipmentStatus(Number(id));
  return NextResponse.json({ ok: true });
}
