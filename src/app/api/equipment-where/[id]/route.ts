import { NextRequest, NextResponse } from "next/server";
import { diffSummary, writeAuditLog } from "@/lib/auditLog";
import { deleteEquipmentFlow, getEquipmentFlow, listEquipmentFlows, updateEquipmentFlow, updateEquipmentFlowStatus } from "@/lib/equipmentFlow";
import { ADMIN_ROLES, BACKOFFICE_ROLES, requireRole } from "@/lib/permissions";

type RouteParams = { id: string } | Promise<{ id: string }>;

async function flowId(params: RouteParams) {
  const resolved = await params;
  return Number(resolved.id);
}

async function findFlowFallback(snapshot: Record<string, unknown> | null | undefined) {
  const equipmentName = String(snapshot?.equipmentName ?? "").trim();
  if (!equipmentName) return null;
  const rows = await listEquipmentFlows({ search: equipmentName });
  const date = String(snapshot?.date ?? "").slice(0, 10);
  const courseTime = String(snapshot?.courseTime ?? "").trim();
  const responsiblePerson = String(snapshot?.responsiblePerson ?? "").trim();
  return rows.find((row) => (
    row.equipmentName === equipmentName
    && (!date || row.date === date)
    && (!courseTime || row.courseTime === courseTime)
    && (!responsiblePerson || row.responsiblePerson === responsiblePerson)
  )) ?? rows[0] ?? null;
}

export async function PUT(req: NextRequest, { params }: { params: RouteParams }) {
  const auth = await requireRole(ADMIN_ROLES);
  if (auth.response) return auth.response;

  const body = await req.json();
  const routeId = await flowId(params);
  const before = (Number.isFinite(routeId) ? await getEquipmentFlow(routeId) : null)
    ?? await findFlowFallback(body);
  if (!before) return NextResponse.json({ error: "找不到這筆器材流向，請先重新整理頁面後再試" }, { status: 404 });

  const equipmentName = String(body.equipmentName ?? "").trim();
  if (!equipmentName) return NextResponse.json({ error: "請填寫器材名稱" }, { status: 400 });

  const id = before.id;
  const updated = await updateEquipmentFlow(id, { ...body, updatedBy: auth.user?.name ?? "" });
  await writeAuditLog(req, {
    action: "update",
    targetType: "EquipmentFlow",
    targetId: id,
    targetLabel: updated?.equipmentName ?? before.equipmentName,
    beforeData: before,
    afterData: updated,
    diffSummary: diffSummary(before, updated ?? {}),
  });
  return NextResponse.json(updated);
}

export async function PATCH(req: NextRequest, { params }: { params: RouteParams }) {
  const auth = await requireRole(BACKOFFICE_ROLES);
  if (auth.response) return auth.response;

  const body = await req.json();
  const routeId = await flowId(params);
  const before = (Number.isFinite(routeId) ? await getEquipmentFlow(routeId) : null)
    ?? await findFlowFallback(body.flow);
  if (!before) return NextResponse.json({ error: "找不到這筆器材流向，請先重新整理頁面後再試" }, { status: 404 });

  const id = before.id;
  const updated = await updateEquipmentFlowStatus(id, body.status, auth.user?.name ?? "");
  await writeAuditLog(req, {
    action: "update_status",
    targetType: "EquipmentFlow",
    targetId: id,
    targetLabel: updated?.equipmentName ?? before.equipmentName,
    beforeData: { status: before.status },
    afterData: { status: updated?.status },
    diffSummary: diffSummary({ status: before.status }, { status: updated?.status }, { status: "狀態" }),
  });
  return NextResponse.json(updated);
}

export async function DELETE(req: NextRequest, { params }: { params: RouteParams }) {
  const auth = await requireRole(ADMIN_ROLES);
  if (auth.response) return auth.response;

  const id = await flowId(params);
  const before = Number.isFinite(id) ? await getEquipmentFlow(id) : null;
  if (!before) return NextResponse.json({ error: "找不到這筆器材流向，請先重新整理頁面後再試" }, { status: 404 });

  await deleteEquipmentFlow(id, auth.user?.name ?? "");
  await writeAuditLog(req, {
    action: "delete",
    targetType: "EquipmentFlow",
    targetId: id,
    targetLabel: before.equipmentName,
    beforeData: before,
    diffSummary: `作廢器材流向：${before.equipmentName}`,
  });
  return NextResponse.json({ ok: true });
}
