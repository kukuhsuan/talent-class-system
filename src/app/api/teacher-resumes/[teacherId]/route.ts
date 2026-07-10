import { NextRequest, NextResponse } from "next/server";
import { diffSummary, writeAuditLog } from "@/lib/auditLog";
import { getTeacherResume, upsertTeacherResume } from "@/lib/teacherResume";
import { ADMIN_ROLES, BACKOFFICE_ROLES, requireRole } from "@/lib/permissions";

type Params = { teacherId: string } | Promise<{ teacherId: string }>;

export async function GET(_req: NextRequest, { params }: { params: Params }) {
  const auth = await requireRole(BACKOFFICE_ROLES);
  if (auth.response) return auth.response;

  const { teacherId } = await params;
  const resume = await getTeacherResume(Number(teacherId));
  if (!resume) return NextResponse.json({ error: "找不到老師簡歷" }, { status: 404 });
  return NextResponse.json(resume);
}

export async function PUT(req: NextRequest, { params }: { params: Params }) {
  const auth = await requireRole(ADMIN_ROLES);
  if (auth.response) return auth.response;

  const { teacherId } = await params;
  const id = Number(teacherId);
  const before = await getTeacherResume(id);
  if (!before) return NextResponse.json({ error: "找不到老師資料" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const updated = await upsertTeacherResume(id, { ...body, updatedBy: auth.user?.name ?? "行政" }, { submitted: true });
  await writeAuditLog(req, {
    action: "update",
    targetType: "TeacherResume",
    targetId: id,
    targetLabel: `老師簡歷：${before.teacherName}`,
    beforeData: before,
    afterData: updated,
    diffSummary: diffSummary(before, updated ?? {}, {
      education: "學歷",
      experience: "經歷",
      teachingStyle: "教學風格",
      specialties: "專長",
      intro: "自我介紹",
      certifications: "證照",
      photoUrl: "照片",
    }) || `修改老師簡歷：${before.teacherName}`,
  });
  return NextResponse.json(updated);
}
