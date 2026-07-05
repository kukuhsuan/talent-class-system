import { NextRequest, NextResponse } from "next/server";
import { buildSchoolInvoicePreview, parseInvoiceRequest } from "@/lib/schoolInvoices";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const input = parseInvoiceRequest(body);
    const invoice = await buildSchoolInvoicePreview(input);
    return NextResponse.json(invoice);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "請款單預覽失敗" },
      { status: 400 },
    );
  }
}
