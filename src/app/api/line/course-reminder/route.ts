import { NextRequest, NextResponse } from "next/server";
import { NOTIFY_ROLES, requireRole, sameOriginOk } from "@/lib/permissions";
import { writeAuditLog } from "@/lib/auditLog";

export async function POST(req: NextRequest) {
  const { user, response } = await requireRole(NOTIFY_ROLES);
  if (response) return response;
  if (!sameOriginOk(req)) return NextResponse.json({ error: "來源不合法" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const dayOffset = Number(body.dayOffset) === 1 ? 1 : 0;
  // 指定老師補發：略過去重直接重送給這一位，供「排程跑完才加課」時人工救援
  const teacherIdRaw = Number(body.teacherId);
  const teacherId = Number.isInteger(teacherIdRaw) && teacherIdRaw > 0 ? teacherIdRaw : null;
  if (!process.env.CRON_SECRET) return NextResponse.json({ error: "提醒排程密鑰尚未設定" }, { status: 500 });

  const label = dayOffset === 1 ? "明日" : "今日";
  await writeAuditLog(req, {
    actorName: user?.name,
    actorRole: user?.role,
    actorUserId: user?.userId ?? undefined,
    action: "manual_course_reminder",
    targetType: "Line",
    targetId: teacherId ?? undefined,
    targetLabel: `${label}課程提醒`,
    diffSummary: teacherId
      ? `指定老師補發${label}課程提醒（teacherId=${teacherId}，略過去重）`
      : `手動補發${label}課程提醒`,
  });

  const params = new URLSearchParams({ dayOffset: String(dayOffset) });
  if (teacherId) params.set("teacherId", String(teacherId));
  const result = await fetch(`${req.nextUrl.origin}/api/cron/reminder?${params}`, {
    headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
    cache: "no-store",
  });
  const data = await result.json().catch(() => ({}));
  return NextResponse.json(data, { status: result.status });
}
