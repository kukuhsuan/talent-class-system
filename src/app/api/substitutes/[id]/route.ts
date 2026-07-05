import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { diffSummary, writeAuditLog } from "@/lib/auditLog";
import { assignSubstitute, cancelSubstitute } from "@/lib/substituteAssignment";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const data = await req.json();
    const current = await prisma.substitute.findUnique({ where: { id: Number(id) } });
    if (!current) return NextResponse.json({ error: "找不到代課紀錄" }, { status: 404 });

    if (current.attendanceId) {
      await assignSubstitute({
        attendanceIds: [current.attendanceId],
        substituteTeacherId: Number(data.substituteTeacherId ?? current.substituteTeacherId),
        role: current.role === "助教" ? "助教" : "主教",
        confirmed: data.confirmed ?? current.confirmed,
        fee: data.fee === "" ? null : data.fee ?? current.fee,
        notes: data.notes ?? current.notes,
      });
    } else {
      await prisma.substitute.update({
        where: { id: Number(id) },
        data: {
          confirmed: data.confirmed ?? current.confirmed,
          fee: data.fee === "" ? null : data.fee ?? current.fee,
          notes: data.notes ?? current.notes,
        },
      });
    }
    const updated = await prisma.substitute.findUnique({ where: { id: Number(id) } });
    await writeAuditLog(req, {
      action: "update",
      targetType: "Substitute",
      targetId: Number(id),
      targetLabel: `代課紀錄 #${id}`,
      beforeData: current,
      afterData: updated ?? data,
      diffSummary: diffSummary(current, updated ?? data, { substituteTeacherId: "代課老師", confirmed: "確認狀態", fee: "代課費", notes: "備註" }) || `修改代課紀錄 #${id}`,
      sensitive: true,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message || "代課紀錄儲存失敗" }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const current = await prisma.substitute.findUnique({ where: { id: Number(id) } });
    const result = await cancelSubstitute(Number(id));
    await writeAuditLog(req, {
      action: "delete",
      targetType: "Substitute",
      targetId: Number(id),
      targetLabel: `取消代課紀錄 #${id}`,
      beforeData: current,
      afterData: result,
      diffSummary: `取消代課紀錄 #${id}`,
      sensitive: true,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message || "取消代課失敗" }, { status: 400 });
  }
}
