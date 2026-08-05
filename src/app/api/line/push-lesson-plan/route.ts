import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { runNotifyBatch } from "@/lib/notifyBatch";
import type { BatchRecipientMessage, LessonPlanCard } from "@/lib/notifyTemplates";
import { NOTIFY_ROLES, requireRole, sameOriginOk } from "@/lib/permissions";
import { writeAuditLog } from "@/lib/auditLog";
import crypto from "crypto";

export async function POST(req: NextRequest) {
  const { user, response } = await requireRole(NOTIFY_ROLES);
  if (response) return response;
  if (!sameOriginOk(req)) return NextResponse.json({ error: "來源不合法" }, { status: 403 });

  const body = await req.json();
  const { teacherIds, courseType, lessonPlans, message } = body;

  if (!teacherIds || !Array.isArray(teacherIds) || teacherIds.length === 0) {
    return NextResponse.json({ error: "未選擇教師" }, { status: 400 });
  }
  if (!courseType || !lessonPlans || !Array.isArray(lessonPlans)) {
    return NextResponse.json({ error: "無效的教案資料" }, { status: 400 });
  }

  const teachers = await prisma.teacher.findMany({
    where: { id: { in: teacherIds } },
    select: { id: true, name: true, lineUserId: true, lineRegion: true },
  });

  if (teachers.length === 0) {
    return NextResponse.json({ error: "找不到指定的教師" }, { status: 404 });
  }

  // 整理要發送的課表資料
  const card: LessonPlanCard = {
    courseName: courseType,
    color: lessonPlans[0]?.color || "#2C5DA8",
    bg: lessonPlans[0]?.bg || "#EAF1FB",
    items: lessonPlans.map((lp: any) => ({
      lesson: lp.lesson,
      title: lp.title || "",
      focus: lp.focus || "",
      skills: lp.skills || [],
      activityDirection: lp.activityDirection || undefined,
    })),
  };

  const recipients: BatchRecipientMessage[] = teachers.map((teacher) => ({
    id: teacher.id,
    name: teacher.name,
    lineUserId: teacher.lineUserId,
    lineRegion: teacher.lineRegion || "north",
    message: message || `您好，這是為您準備的 ${courseType} 教案，請參考！`,
    lessonPlans: [card],
  }));

  const uuid = crypto.randomUUID();

  await writeAuditLog(req, {
    actorName: user?.name, actorRole: user?.role, actorUserId: user?.userId ?? undefined,
    action: "push_lesson_plan", targetType: "Line", targetLabel: courseType,
    diffSummary: `發送 ${courseType} 教案給 ${teachers.length} 位教師`,
  });

  try {
    const result = await runNotifyBatch({
      uuid,
      actor: { userId: user?.userId ?? null, name: user?.name ?? "系統", role: user?.role ?? "admin" },
      templateKey: "lesson_plan_push",
      templateLabel: "教案推播",
      targetType: "teacher",
      recipients,
      testMode: false,
      dryRun: false,
    });

    return NextResponse.json({ ok: true, batchId: result.batch.id, duplicated: result.duplicated });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
