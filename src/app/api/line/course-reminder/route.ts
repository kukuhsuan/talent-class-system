import { NextRequest, NextResponse } from "next/server";
import { NOTIFY_ROLES, requireRole, sameOriginOk } from "@/lib/permissions";
import { writeAuditLog } from "@/lib/auditLog";

export async function POST(req: NextRequest) {
  const { user, response } = await requireRole(NOTIFY_ROLES);
  if (response) return response;
  if (!sameOriginOk(req)) return NextResponse.json({ error: "來源不合法" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const dayOffset = Number(body.dayOffset) === 1 ? 1 : 0;
  if (!process.env.CRON_SECRET) return NextResponse.json({ error: "提醒排程密鑰尚未設定" }, { status: 500 });

  await writeAuditLog(req, {
    actorName: user?.name,
    actorRole: user?.role,
    actorUserId: user?.userId ?? undefined,
    action: "manual_course_reminder",
    targetType: "Line",
    targetLabel: dayOffset === 1 ? "明日課程提醒" : "今日課程提醒",
    diffSummary: `手動補發${dayOffset === 1 ? "明日" : "今日"}課程提醒`,
  });

  const result = await fetch(`${req.nextUrl.origin}/api/cron/reminder?dayOffset=${dayOffset}`, {
    headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
    cache: "no-store",
  });
  const data = await result.json().catch(() => ({}));
  return NextResponse.json(data, { status: result.status });
}
