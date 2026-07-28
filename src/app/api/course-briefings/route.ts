import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createCourseBriefing, listCourseBriefings, sendCourseBriefing } from "@/lib/courseBriefing";
import { NOTIFY_ROLES, requireRole, sameOriginOk } from "@/lib/permissions";

export async function GET(req: NextRequest) {
  const { response } = await requireRole(NOTIFY_ROLES);
  if (response) return response;
  const from = req.nextUrl.searchParams.get("from") || undefined;
  const to = req.nextUrl.searchParams.get("to") || undefined;
  return NextResponse.json(await listCourseBriefings({ from, to }));
}

export async function POST(req: NextRequest) {
  const { user, response } = await requireRole(NOTIFY_ROLES);
  if (response) return response;
  if (!sameOriginOk(req)) return NextResponse.json({ error: "來源不合法" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const courseId = Number(body.courseId);
  const targetDate = String(body.targetDate ?? "").slice(0, 10);
  const content = String(body.content ?? "").trim();
  if (!courseId || !/^\d{4}-\d{2}-\d{2}$/.test(targetDate) || !content) {
    return NextResponse.json({ error: "請選擇課程、日期並填寫交辦內容" }, { status: 400 });
  }
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { id: true, teacherId: true, assistantTeacherId: true },
  });
  if (!course) return NextResponse.json({ error: "找不到課程" }, { status: 404 });
  const teacherId = Number(body.teacherId || course.teacherId);
  if (![course.teacherId, course.assistantTeacherId].includes(teacherId)) {
    return NextResponse.json({ error: "選擇的老師不屬於這堂課" }, { status: 400 });
  }
  const row = await createCourseBriefing({
    courseId, teacherId, targetDate, content,
    equipmentNote: String(body.equipmentNote ?? ""),
    createdBy: user?.name ?? "",
  });
  if (!row) return NextResponse.json({ error: "建立交辦失敗" }, { status: 500 });
  let sendError = "";
  try { await sendCourseBriefing(row, "immediate"); } catch (error) { sendError = (error as Error).message; }
  return NextResponse.json({ ok: true, item: row, notified: !sendError, sendError });
}
