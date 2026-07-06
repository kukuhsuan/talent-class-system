import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type SubstituteRole = "主教" | "助教";

type AssignmentInput = {
  attendanceIds: number[];
  substituteTeacherId: number;
  role: SubstituteRole;
  confirmed?: boolean;
  fee?: number | null;
  notes?: string;
};

export async function assignSubstitute(input: AssignmentInput) {
  const attendanceIds = [...new Set(input.attendanceIds.filter(Number.isFinite))];
  if (attendanceIds.length === 0) throw new Error("請選擇要代課的課堂");
  if (!Number.isFinite(input.substituteTeacherId)) throw new Error("請選擇代課老師");

  const [teacher, attendances] = await Promise.all([
    prisma.teacher.findUnique({ where: { id: input.substituteTeacherId }, select: { id: true } }),
    prisma.attendance.findMany({
      where: { id: { in: attendanceIds } },
      include: { course: true },
    }),
  ]);
  if (!teacher) throw new Error("找不到代課老師");
  if (attendances.length !== attendanceIds.length) throw new Error("部分課堂已不存在，請重新選擇");

  const operations: Prisma.PrismaPromise<unknown>[] = [];
  for (const attendance of attendances) {
    if (attendance.cancelled) throw new Error(`${attendance.course.school} ${attendance.course.time} 已停課，不能安排代課`);
    if (attendance.isPayrollLocked) throw new Error(`${attendance.course.school} ${attendance.course.time} 已鎖定薪資，不能更換老師`);

    const originalTeacherId = input.role === "助教"
      ? attendance.course.assistantTeacherId
      : attendance.course.teacherId;
    if (!originalTeacherId) throw new Error(`${attendance.course.school} ${attendance.course.time} 沒有原助教可供代課`);
    if (originalTeacherId === input.substituteTeacherId) {
      throw new Error(`${attendance.course.school} ${attendance.course.time} 的代課老師與原老師相同`);
    }
    const conflictsWithOtherRole = input.role === "助教"
      ? attendance.actualTeacherId === input.substituteTeacherId
      : attendance.assistantTeacherId === input.substituteTeacherId;
    if (conflictsWithOtherRole) {
      throw new Error(`${attendance.course.school} ${attendance.course.time} 的主教與助教不能是同一人`);
    }

    operations.push(
      prisma.attendance.update({
        where: { id: attendance.id, isPayrollLocked: false },
        data: input.role === "助教"
          ? { assistantTeacherId: input.substituteTeacherId }
          : { actualTeacherId: input.substituteTeacherId },
      }),
      prisma.substitute.upsert({
        where: { attendanceId_role: { attendanceId: attendance.id, role: input.role } },
        create: {
          attendanceId: attendance.id,
          role: input.role,
          date: attendance.date,
          school: attendance.course.school,
          courseType: attendance.course.courseType,
          originalTeacherId,
          substituteTeacherId: input.substituteTeacherId,
          confirmed: Boolean(input.confirmed),
          fee: input.fee ?? null,
          notes: input.notes ?? "",
        },
        update: {
          substituteTeacherId: input.substituteTeacherId,
          confirmed: Boolean(input.confirmed),
          fee: input.fee ?? null,
          notes: input.notes ?? "",
          date: attendance.date,
          school: attendance.course.school,
          courseType: attendance.course.courseType,
          originalTeacherId,
        },
      }),
    );
  }

  await prisma.$transaction(operations);
  return { updated: attendances.length };
}

// 後台直接改出勤老師時，同步代課紀錄（一律以出勤為主）
// 改回原老師＝取消代課；改成別人＝更新代課老師
export async function syncSubstituteWithAttendance(attendanceId: number, role: SubstituteRole, newTeacherId: number | null) {
  const record = await prisma.substitute.findUnique({
    where: { attendanceId_role: { attendanceId, role } },
  });
  if (!record) return;
  if (!newTeacherId || record.originalTeacherId === newTeacherId) {
    await prisma.substitute.delete({ where: { id: record.id } });
  } else if (record.substituteTeacherId !== newTeacherId) {
    await prisma.substitute.update({ where: { id: record.id }, data: { substituteTeacherId: newTeacherId } });
  }
}

export async function cancelSubstitute(id: number) {
  const record = await prisma.substitute.findUnique({
    where: { id },
    include: { attendance: { include: { course: true } } },
  });
  if (!record) throw new Error("找不到代課紀錄");
  if (!record.attendance) {
    await prisma.substitute.delete({ where: { id } });
    return { restored: false };
  }
  if (record.attendance.isPayrollLocked) throw new Error("此課堂已鎖定薪資，不能取消代課");

  const originalTeacherId = record.role === "助教"
    ? record.attendance.course.assistantTeacherId
    : record.attendance.course.teacherId;
  if (!originalTeacherId) throw new Error("找不到原老師，無法取消代課");

  await prisma.$transaction([
    prisma.attendance.update({
      where: { id: record.attendanceId!, isPayrollLocked: false },
      data: record.role === "助教"
        ? { assistantTeacherId: originalTeacherId }
        : { actualTeacherId: originalTeacherId },
    }),
    prisma.substitute.delete({ where: { id } }),
  ]);
  return { restored: true };
}
