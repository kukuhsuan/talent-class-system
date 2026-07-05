import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/auditLog";
import { assignSubstitute } from "@/lib/substituteAssignment";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const year = Number(searchParams.get("year")) || 0;
  const month = Number(searchParams.get("month")) || 0;
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const pageSize = Math.min(100, Math.max(20, Number(searchParams.get("pageSize")) || 50));
  const paged = year > 0 && month >= 1 && month <= 12;
  const where = paged ? { date: { gte: new Date(year, month - 1, 1), lt: new Date(year, month, 1) } } : {};
  const [records, total] = await Promise.all([prisma.substitute.findMany({
    where,
    include: {
      originalTeacher: true,
      substituteTeacher: true,
      attendance: {
        include: {
          course: { include: { teacher: true, assistantTeacher: true } },
          actualTeacher: true,
          assistantTeacher: true,
        },
      },
    },
    orderBy: { date: "desc" },
    ...(paged ? { skip: (page - 1) * pageSize, take: pageSize } : {}),
  }), paged ? prisma.substitute.count({ where }) : Promise.resolve(0)]);

  const savedRecords = records.map((record) => {
    const linkedAttendance = record.attendance;
    const assistantRole = record.role === "助教";
    return {
      ...record,
      source: record.attendanceId ? "linked" : "manual",
      originalTeacher: linkedAttendance
        ? assistantRole
          ? linkedAttendance.course.assistantTeacher ?? record.originalTeacher
          : linkedAttendance.course.teacher
        : record.originalTeacher,
      substituteTeacher: linkedAttendance
        ? assistantRole
          ? linkedAttendance.assistantTeacher
          : linkedAttendance.actualTeacher
        : record.substituteTeacher,
      time: linkedAttendance?.course.time ?? "",
      address: linkedAttendance?.course.address ?? "",
    };
  });

  const items = savedRecords.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  return NextResponse.json(paged ? { items, total, page, pageSize } : items);
}

export async function POST(req: NextRequest) {
  try {
    const data = await req.json();
    const result = await assignSubstitute({
      attendanceIds: Array.isArray(data.attendanceIds) ? data.attendanceIds.map(Number) : [],
      substituteTeacherId: Number(data.substituteTeacherId),
      role: data.role === "助教" ? "助教" : "主教",
      confirmed: Boolean(data.confirmed),
      fee: data.fee === "" || data.fee == null ? null : Number(data.fee),
      notes: typeof data.notes === "string" ? data.notes : "",
    });
    await writeAuditLog(req, {
      action: "create",
      targetType: "Substitute",
      targetId: Number(data.substituteTeacherId),
      targetLabel: `指定代課老師 #${Number(data.substituteTeacherId)}`,
      afterData: { request: data, result },
      diffSummary: `指定代課老師 #${Number(data.substituteTeacherId)}，共 ${Array.isArray(data.attendanceIds) ? data.attendanceIds.length : 0} 堂`,
      sensitive: true,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message || "代課建立失敗" }, { status: 400 });
  }
}
