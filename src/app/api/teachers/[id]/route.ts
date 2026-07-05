import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { diffSummary, writeAuditLog } from "@/lib/auditLog";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const teacher = await prisma.teacher.findUnique({ where: { id: Number(id) } });
  if (!teacher) return NextResponse.json({ error: "找不到老師資料" }, { status: 404 });
  return NextResponse.json(teacher);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await req.json();
  const before = await prisma.teacher.findUnique({ where: { id: Number(id) } });
  if (!before) return NextResponse.json({ error: "找不到老師資料" }, { status: 404 });
  const teacher = await prisma.teacher.update({
    where: { id: Number(id) },
    data: {
      ...data,
      lineUserId: data.lineUserId?.trim() || null,
      lineRegion: data.lineRegion || "",
      isAssistant: Boolean(data.isAssistant),
      assistantFee: Number(data.assistantFee) || 0,
      bankName: data.bankName?.trim() || "",
      bankCode: data.bankCode?.trim() || "",
      bankBranch: data.bankBranch?.trim() || "",
      bankAccountName: data.bankAccountName?.trim() || "",
      bankAccountNumber: data.bankAccountNumber?.replace(/\s+/g, "") || "",
    },
  });
  await writeAuditLog(req, {
    action: "update",
    targetType: "Teacher",
    targetId: teacher.id,
    targetLabel: `老師：${teacher.name}`,
    beforeData: before,
    afterData: teacher,
    diffSummary: diffSummary(before as unknown as Record<string, unknown>, teacher as unknown as Record<string, unknown>, {
      name: "姓名",
      lineUserId: "LINE 綁定",
      rateAfterSchool: "課後薪資",
      rateInSchool: "課內薪資",
      travelFee: "車馬費",
      bankAccountNumber: "銀行帳號",
    }) || `修改老師：${teacher.name}`,
    sensitive: true,
  });
  return NextResponse.json(teacher);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const before = await prisma.teacher.findUnique({ where: { id: Number(id) } });
  await prisma.teacher.delete({ where: { id: Number(id) } });
  await writeAuditLog(req, {
    action: "delete",
    targetType: "Teacher",
    targetId: id,
    targetLabel: before ? `老師：${before.name}` : `老師：${id}`,
    beforeData: before,
    diffSummary: before ? `刪除老師：${before.name}` : `刪除老師：${id}`,
    sensitive: true,
  });
  return NextResponse.json({ ok: true });
}
