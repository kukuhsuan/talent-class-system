import { NextRequest, NextResponse } from "next/server";
import { diffSummary, writeAuditLog } from "@/lib/auditLog";
import { createEquipmentFlow, listEquipmentFlows } from "@/lib/equipmentFlow";
import { ADMIN_ROLES, BACKOFFICE_ROLES, requireRole } from "@/lib/permissions";

export async function GET(req: NextRequest) {
  const auth = await requireRole(BACKOFFICE_ROLES);
  if (auth.response) return auth.response;

  const { searchParams } = new URL(req.url);
  const rows = await listEquipmentFlows({
    date: searchParams.get("date") ?? "",
    course: searchParams.get("course") ?? "",
    school: searchParams.get("school") ?? "",
    status: searchParams.get("status") ?? "",
    deliveryMethod: searchParams.get("deliveryMethod") ?? "",
    responsible: searchParams.get("responsible") ?? "",
    search: searchParams.get("search") ?? "",
  });
  const response = NextResponse.json(rows);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function POST(req: NextRequest) {
  const auth = await requireRole(ADMIN_ROLES);
  if (auth.response) return auth.response;

  const body = await req.json();
  const equipmentName = String(body.equipmentName ?? "").trim();
  if (!equipmentName) return NextResponse.json({ error: "請填寫器材名稱" }, { status: 400 });

  const created = await createEquipmentFlow({
    ...body,
    updatedBy: auth.user?.name ?? "",
  });
  if (!created) return NextResponse.json({ error: "新增器材流向失敗" }, { status: 500 });

  await writeAuditLog(req, {
    action: "create",
    targetType: "EquipmentFlow",
    targetId: created.id,
    targetLabel: created.equipmentName,
    afterData: created,
    diffSummary: diffSummary(null, created),
  });

  return NextResponse.json(created);
}
