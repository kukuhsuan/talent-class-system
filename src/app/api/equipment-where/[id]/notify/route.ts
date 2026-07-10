import { NextRequest, NextResponse } from "next/server";
import { writeAuditLog } from "@/lib/auditLog";
import { getEquipmentFlow, listEquipmentFlows, updateEquipmentFlowStatus } from "@/lib/equipmentFlow";
import { buildEquipmentFlowInquiryMessage, getLineConfig, normalizeLineRegion, pushMessage } from "@/lib/line";
import { ADMIN_ROLES, requireRole } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

type NotifyParams = { id: string } | Promise<{ id: string }>;

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

export async function POST(req: NextRequest, { params }: { params: NotifyParams }) {
  const auth = await requireRole(ADMIN_ROLES);
  if (auth.response) return auth.response;

  const body = await req.json().catch(() => ({}));
  const routeParams = await params;
  const id = Number(routeParams.id);
  const flow = (Number.isFinite(id) ? await getEquipmentFlow(id) : null)
    ?? await findFlowFallback(body.flow);
  if (!flow) {
    return NextResponse.json({ error: "找不到這筆器材流向，請先重新整理頁面後再試" }, { status: 404 });
  }

  const teacher = flow.responsibleTeacherId
    ? await prisma.teacher.findUnique({
        where: { id: flow.responsibleTeacherId },
        select: { id: true, name: true, lineUserId: true, lineRegion: true },
      })
    : await prisma.teacher.findFirst({
        where: { name: flow.responsiblePerson },
        select: { id: true, name: true, lineUserId: true, lineRegion: true },
      });

  if (!teacher?.lineUserId) {
    return NextResponse.json({ error: "負責人尚未綁定 LINE，無法發送詢問" }, { status: 400 });
  }

  const region = normalizeLineRegion(teacher.lineRegion || "north");
  const cfg = getLineConfig(region);
  if (!cfg.token) return NextResponse.json({ error: "LINE 官方帳號 token 尚未設定" }, { status: 500 });

  try {
    await pushMessage(teacher.lineUserId, [buildEquipmentFlowInquiryMessage({
      flowId: flow.id,
      date: flow.date,
      time: flow.courseTime,
      courseName: flow.courseName,
      schoolName: flow.schoolName,
      schoolAddress: flow.schoolAddress,
      equipmentName: flow.equipmentName,
      equipmentContent: flow.equipmentContent,
      currentLocation: flow.currentLocation,
      nextSchoolName: flow.nextSchoolName,
      nextDate: flow.nextDate,
      nextAddress: flow.nextAddress,
      deliveryMethod: flow.deliveryMethod,
      transportSubsidyEligible: flow.transportSubsidyEligible,
      notes: flow.notes,
    })], cfg.token);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message || "LINE 發送失敗" }, { status: 502 });
  }

  await writeAuditLog(req, {
    action: "line_notify",
    targetType: "EquipmentFlow",
    targetId: flow.id,
    targetLabel: flow.equipmentName,
    beforeData: { status: flow.status },
    afterData: { teacher: teacher.name, lineRegion: region, status: "已詢問" },
    diffSummary: `系統發送器材詢問給 ${teacher.name}，狀態：${flow.status} → 已詢問`,
  });
  const updated = await updateEquipmentFlowStatus(flow.id, "已詢問", auth.user?.name ?? "");

  return NextResponse.json({ ok: true, teacher: teacher.name, flow: updated });
}
