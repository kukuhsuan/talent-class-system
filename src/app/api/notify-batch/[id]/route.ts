import { NextRequest, NextResponse } from "next/server";
import { NOTIFY_ROLES, requireRole } from "@/lib/permissions";
import { getBatchById, listBatchRecipients } from "@/lib/notifyBatch";

// 批次發送紀錄明細（lineUserId 一律只存/回遮罩值）
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { response } = await requireRole(NOTIFY_ROLES);
  if (response) return response;
  const { id } = await params;
  const batchId = Number(id);
  if (!Number.isInteger(batchId) || batchId <= 0) {
    return NextResponse.json({ error: "批次不存在" }, { status: 404 });
  }
  const batch = await getBatchById(batchId);
  if (!batch) return NextResponse.json({ error: "批次不存在" }, { status: 404 });
  const recipients = await listBatchRecipients(batchId);
  return NextResponse.json({ batch, recipients });
}
