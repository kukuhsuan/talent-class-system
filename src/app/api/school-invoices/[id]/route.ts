import { NextRequest, NextResponse } from "next/server";
import { deleteSchoolInvoice, readSchoolInvoice, updateSchoolInvoiceStatus } from "@/lib/schoolInvoices";
import { diffSummary, writeAuditLog } from "@/lib/auditLog";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const invoice = await readSchoolInvoice(Number(id));
    if (!invoice) return NextResponse.json({ error: "找不到請款單" }, { status: 404 });
    return NextResponse.json(invoice);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "請款單讀取失敗" },
      { status: 500 },
    );
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const before = await readSchoolInvoice(Number(id));
    const invoice = await updateSchoolInvoiceStatus(Number(id), String(body.status ?? ""));
    if (!invoice) return NextResponse.json({ error: "找不到請款單" }, { status: 404 });
    await writeAuditLog(req, {
      action: "update",
      targetType: "SchoolInvoice",
      targetId: invoice.id,
      targetLabel: `${invoice.schoolName} ${invoice.invoiceMonth}`,
      beforeData: before,
      afterData: invoice,
      diffSummary: diffSummary(before as unknown as Record<string, unknown>, invoice as unknown as Record<string, unknown>, { status: "狀態", totalAmount: "金額" }) || `修改請款單：${invoice.schoolName} ${invoice.invoiceMonth}`,
      sensitive: true,
    });
    return NextResponse.json(invoice);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "請款單更新失敗" },
      { status: 400 },
    );
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const invoice = await deleteSchoolInvoice(Number(id));
    if (!invoice) return NextResponse.json({ error: "找不到請款單" }, { status: 404 });
    await writeAuditLog(req, {
      action: "delete",
      targetType: "SchoolInvoice",
      targetId: invoice.id,
      targetLabel: `${invoice.schoolName} ${invoice.invoiceMonth}`,
      beforeData: invoice,
      diffSummary: `刪除請款單：${invoice.schoolName} ${invoice.invoiceMonth}`,
      sensitive: true,
    });
    return NextResponse.json({ ok: true, deleted: invoice });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "請款單刪除失敗" },
      { status: 400 },
    );
  }
}
