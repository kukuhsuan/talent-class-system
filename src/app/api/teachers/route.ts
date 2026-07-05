import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/auditLog";

export async function GET() {
  const teachers = await prisma.teacher.findMany({ orderBy: { name: "asc" } });
  return NextResponse.json(teachers.map(({ bankAccountName: _bankAccountName, bankAccountNumber, ...teacher }) => ({
    ...teacher,
    bankAccountMasked: bankAccountNumber
      ? `末${bankAccountNumber.replace(/\s+/g, "").slice(-5)}`
      : "",
  })));
}

export async function POST(req: NextRequest) {
  const data = await req.json();
  const teacher = await prisma.teacher.create({
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
    action: "create",
    targetType: "Teacher",
    targetId: teacher.id,
    targetLabel: `老師：${teacher.name}`,
    afterData: teacher,
    diffSummary: `新增老師：${teacher.name}`,
    sensitive: true,
  });
  return NextResponse.json(teacher, { status: 201 });
}
