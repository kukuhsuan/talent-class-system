import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/auditLog";
import { teacherTeachingProfiles } from "@/lib/teacherTeachingProfile";

export async function GET(req: NextRequest) {
  // 效能：minimal 模式只回下拉選單需要的欄位，跳過近 90 天出勤全量掃描（teacherTeachingProfiles）
  if (req.nextUrl.searchParams.get("minimal") === "1") {
    const rows = await prisma.teacher.findMany({
      select: { id: true, name: true, isAssistant: true },
      orderBy: { name: "asc" },
    });
    return NextResponse.json(rows, { headers: { "Cache-Control": "private, max-age=300" } });
  }

  const teachers = await prisma.teacher.findMany({ orderBy: { name: "asc" } });
  const profiles = await teacherTeachingProfiles(prisma, teachers.map((teacher) => teacher.id));
  return NextResponse.json(teachers.map((row) => {
    const teacher = { ...row, bankAccountName: undefined, bankAccountNumber: undefined };
    const teachingProfile = profiles.get(row.id);
    return {
      ...teacher,
      bankAccountMasked: row.bankAccountNumber
        ? `末${row.bankAccountNumber.replace(/\s+/g, "").slice(-5)}`
        : "",
      teachingProfile,
    };
  }));
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
      bankAccountName: data.bankAccountName?.trim() || data.name?.trim() || "",
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
