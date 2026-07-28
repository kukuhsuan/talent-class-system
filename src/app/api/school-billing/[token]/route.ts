import { NextRequest, NextResponse } from "next/server";
import { billingProfileByToken, saveBillingProfile } from "@/lib/schoolBillingProfile";
import { pushOperationsAlert } from "@/lib/operationsNotifications";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const profile = await billingProfileByToken((await params).token);
  if (!profile) return NextResponse.json({ error: "連結無效或已失效" }, { status: 404 });
  return NextResponse.json(profile, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const profile = await billingProfileByToken((await params).token);
  if (!profile) return NextResponse.json({ error: "連結無效或已失效" }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  const officialName = String(body.officialName ?? "").trim();
  const invoiceTitle = String(body.invoiceTitle ?? "").trim();
  const taxId = String(body.taxId ?? "").replace(/\D/g, "");
  const billingEmail = String(body.billingEmail ?? "").trim().toLowerCase();
  if (!officialName || officialName.length > 100) return NextResponse.json({ error: "請填寫正確的園所正式名稱" }, { status: 400 });
  if (!invoiceTitle || invoiceTitle.length > 100) return NextResponse.json({ error: "請填寫正確的請款／發票抬頭" }, { status: 400 });
  if (!/^\d{8}$/.test(taxId)) return NextResponse.json({ error: "統一編號需為 8 位數字" }, { status: 400 });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(billingEmail) || billingEmail.length > 150) return NextResponse.json({ error: "請填寫正確的收件信箱" }, { status: 400 });
  await saveBillingProfile({ schoolId: profile.schoolId, officialName, invoiceTitle, taxId, billingEmail });
  await pushOperationsAlert(`✅【新園所資料完成】${profile.schoolName}\n園所已送出請款與發票資料，請至園所管理確認。`).catch(console.error);
  return NextResponse.json({ ok: true });
}
