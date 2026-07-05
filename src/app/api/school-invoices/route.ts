import { NextRequest, NextResponse } from "next/server";
import { createSchoolInvoice, listSchoolInvoices, parseInvoiceRequest } from "@/lib/schoolInvoices";
import { writeAuditLog } from "@/lib/auditLog";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const year = Number(searchParams.get("year") ?? "0") || undefined;
    const month = Number(searchParams.get("month") ?? "0") || undefined;
    const schoolId = Number(searchParams.get("schoolId") ?? "0") || undefined;
    const items = await listSchoolInvoices({ year, month, schoolId });
    return NextResponse.json(items);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "請款單列表讀取失敗" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const input = parseInvoiceRequest(body);
    const invoice = await createSchoolInvoice(input);
    await writeAuditLog(req, {
      action: "create",
      targetType: "SchoolInvoice",
      targetId: invoice.id,
      targetLabel: `${invoice.schoolName} ${invoice.invoiceMonth}`,
      afterData: invoice,
      diffSummary: `建立請款單：${invoice.schoolName} ${invoice.invoiceMonth}，金額 ${invoice.totalAmount} 元`,
      sensitive: true,
    });
    return NextResponse.json(invoice, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "請款單建立失敗" },
      { status: 400 },
    );
  }
}
