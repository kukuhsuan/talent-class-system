import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureCourseBriefingTable, getCourseBriefing, sendCourseBriefing } from "@/lib/courseBriefing";
import { NOTIFY_ROLES, requireRole, sameOriginOk } from "@/lib/permissions";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { response } = await requireRole(NOTIFY_ROLES);
  if (response) return response;
  if (!sameOriginOk(req)) return NextResponse.json({ error: "來源不合法" }, { status: 403 });
  await ensureCourseBriefingTable();
  const id = Number((await params).id);
  const body = await req.json().catch(() => ({}));
  if (body.action === "resend") {
    const row = await getCourseBriefing(id);
    if (!row) return NextResponse.json({ error: "找不到交辦" }, { status: 404 });
    await sendCourseBriefing(row, "immediate");
    return NextResponse.json({ ok: true });
  }
  const status = String(body.status ?? "");
  if (!["pending", "completed", "cancelled"].includes(status)) {
    return NextResponse.json({ error: "狀態不正確" }, { status: 400 });
  }
  await prisma.$executeRawUnsafe("UPDATE CourseBriefing SET status = ? WHERE id = ?", status, id);
  return NextResponse.json({ ok: true });
}
