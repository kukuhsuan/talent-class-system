import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizeDepartment, normalizeRegion } from "@/lib/courseMeta";
import {
  confirmationHistory,
  copyPreviousSchoolStartConfirmation,
  courseConfirmationSummary,
  ensureCourseConfirmationColumn,
  parseConfirmationTerm,
  parseCourseConfirmation,
  reopenSchoolStartConfirmation,
  resetSchoolStartConfirmation,
  termLabel,
  upsertSchoolStartConfirmation,
} from "@/lib/courseConfirmation";
import { diffSummary, writeAuditLog } from "@/lib/auditLog";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await ensureCourseConfirmationColumn();
  const data = await req.json().catch(() => ({}));
  const term = parseConfirmationTerm(data.confirmationTerm ?? data);
  if (data.action === "reopenConfirmation") {
    const courseConfirmation = await reopenSchoolStartConfirmation(Number(id), term);
    await writeAuditLog(req, {
      action: "reopen",
      targetType: "SchoolStartConfirmation",
      targetId: courseConfirmation.id ?? `${id}`,
      targetLabel: `園所 ${id} ${termLabel(term)}`,
      afterData: courseConfirmation,
      diffSummary: `重新開放開課前確認表：${termLabel(term)}`,
    });
    return NextResponse.json({
      ok: true,
      courseConfirmation,
      courseConfirmationSummary: courseConfirmationSummary(courseConfirmation, { includeTerm: true, multiline: true }),
      courseConfirmationHistory: courseConfirmation.id ? await confirmationHistory(courseConfirmation.id) : [],
      confirmationTerm: { ...term, label: termLabel(term) },
    });
  }
  if (data.action === "resetConfirmation") {
    const courseConfirmation = await resetSchoolStartConfirmation(Number(id), term);
    await writeAuditLog(req, {
      action: "delete",
      targetType: "SchoolStartConfirmation",
      targetId: courseConfirmation.id ?? `${id}`,
      targetLabel: `園所 ${id} ${termLabel(term)}`,
      afterData: courseConfirmation,
      diffSummary: `清除開課前確認表測試資料：${termLabel(term)}`,
    });
    return NextResponse.json({
      ok: true,
      courseConfirmation,
      courseConfirmationSummary: courseConfirmationSummary(courseConfirmation, { includeTerm: true, multiline: true }),
      courseConfirmationHistory: courseConfirmation.id ? await confirmationHistory(courseConfirmation.id) : [],
      confirmationTerm: { ...term, label: termLabel(term) },
    });
  }
  if (data.action !== "copyPrevious") {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
  const courseConfirmation = await copyPreviousSchoolStartConfirmation(Number(id), term);
  await writeAuditLog(req, {
    action: "create",
    targetType: "SchoolStartConfirmation",
    targetId: courseConfirmation.id ?? `${id}`,
    targetLabel: `園所 ${id} ${termLabel(term)}`,
    afterData: courseConfirmation,
    diffSummary: `複製上一學期開課前確認：${termLabel(term)}`,
  });
  return NextResponse.json({
    ok: true,
    courseConfirmation,
    courseConfirmationSummary: courseConfirmationSummary(courseConfirmation, { includeTerm: true, multiline: true }),
    courseConfirmationHistory: courseConfirmation.id ? await confirmationHistory(courseConfirmation.id) : [],
    confirmationTerm: { ...term, label: termLabel(term) },
  });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await ensureCourseConfirmationColumn();
  const data = await req.json();
  const term = parseConfirmationTerm(data.confirmationTerm ?? data);
  const before = await prisma.school.findUnique({ where: { id: Number(id) } });
  if (!before) return NextResponse.json({ error: "找不到園所" }, { status: 404 });
  const school = await prisma.school.update({
    where: { id: Number(id) },
    data: {
      name: data.name,
      type: data.type ? normalizeDepartment(data.type) : "",
      region: normalizeRegion(data.region),
      address: data.address ?? "",
      phone: data.phone ?? "",
      contact: data.contact ?? "",
      notes: data.notes ?? "",
      lineUserId: typeof data.lineUserId === "string" ? data.lineUserId.trim() || null : undefined,
      lineBindCode: data.lineBindCode ?? undefined,
    },
  });
  let courseConfirmation = parseCourseConfirmation(data.courseConfirmation);
  if (data.courseConfirmation) {
    courseConfirmation = await upsertSchoolStartConfirmation(Number(id), term, data.courseConfirmation, { submit: false });
  }
  await writeAuditLog(req, {
    action: "update",
    targetType: "School",
    targetId: school.id,
    targetLabel: `園所：${school.name}`,
    beforeData: before,
    afterData: { ...school, courseConfirmation },
    diffSummary: diffSummary(before as unknown as Record<string, unknown>, school as unknown as Record<string, unknown>, {
      name: "園所名稱",
      address: "地址",
      phone: "電話",
      contact: "聯絡人",
      type: "部門",
      lineUserId: "LINE 綁定",
    }) || `修改園所：${school.name}`,
  });
  return NextResponse.json({
    ...school,
    courseConfirmation,
    courseConfirmationSummary: courseConfirmationSummary(courseConfirmation, { includeTerm: true, multiline: true }),
    confirmationTerm: { ...term, label: termLabel(term) },
  });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const before = await prisma.school.findUnique({ where: { id: Number(id) } });
  await prisma.school.delete({ where: { id: Number(id) } });
  await writeAuditLog(req, {
    action: "delete",
    targetType: "School",
    targetId: id,
    targetLabel: before ? `園所：${before.name}` : `園所：${id}`,
    beforeData: before,
    diffSummary: before ? `刪除園所：${before.name}` : `刪除園所：${id}`,
    sensitive: true,
  });
  return NextResponse.json({ ok: true });
}
