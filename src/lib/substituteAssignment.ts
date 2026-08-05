import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  buildSubstituteAssignedMessage,
  buildSubstituteReplacedMessage,
  getLineConfig,
  pushMessage,
  type LineRegion,
} from "@/lib/line";
import { courseEndAt } from "@/lib/reportWindow";
import { effectiveAttendanceTime } from "@/lib/attendanceTime";
import { ensureWaitingTeacherId, findWaitingTeacherId, openLeaveForAttendance } from "@/lib/pendingSubstitute";

export type SubstituteRole = "主教" | "助教";

type AssignmentInput = {
  attendanceIds: number[];
  substituteTeacherId: number;
  role: SubstituteRole;
  confirmed?: boolean;
  fee?: number | null;
  notes?: string;
  // 請假流程的兩支端點（confirm-substitute、manual-substitute）自己有一套通知文案，
  // 傳 false 才不會讓老師同時收到兩則內容重複的訊息。
  notify?: boolean;
};

type AttendanceWithCourse = Prisma.AttendanceGetPayload<{ include: { course: true } }>;

type NotifyPlan = {
  attendance: AttendanceWithCourse;
  // 這堂課原本要去的人（可能是原老師，也可能是上一位代課老師），用來發「不用來了」的異動通知
  previousTeacherId: number | null;
};

// 通知一律在交易提交後才送，而且失敗只記 log：
// LINE 送不出去不該讓已經寫進資料庫的代課安排被回滾。
async function notifyAssignment(
  substitute: { id: number; name: string; lineUserId: string | null; lineRegion: string | null },
  role: SubstituteRole,
  plans: NotifyPlan[],
) {
  const detailOf = (attendance: AttendanceWithCourse) => {
    const time = effectiveAttendanceTime({
      scheduledTime: attendance.scheduledTime,
      courseTime: attendance.course.time,
      attendanceHours: attendance.hours,
      isPayrollLocked: attendance.isPayrollLocked,
      reportContent: attendance.reportContent,
      reportSentAt: attendance.reportSentAt,
      studentCount: attendance.studentCount,
      studentCountA: attendance.studentCountA,
      studentCountB: attendance.studentCountB,
    });
    const msLeft = courseEndAt(attendance, time).getTime() - Date.now();
    return {
      date: attendance.date.toISOString().slice(0, 10),
      time,
      school: attendance.scheduledSchoolName.trim() || attendance.course.school,
      courseType: attendance.course.courseType,
      address: attendance.scheduledAddress.trim() || attendance.course.address,
      // 已經上完的課不標「即將開始」，只有還沒結束且在 12 小時內才算急件
      urgent: msLeft > 0 && msLeft < 12 * 60 * 60 * 1000,
    };
  };

  const pushSafe = async (
    teacher: { name: string; lineUserId: string | null; lineRegion: string | null },
    messages: object[],
  ) => {
    if (!teacher.lineUserId || messages.length === 0) return;
    try {
      await pushMessage(teacher.lineUserId, messages, getLineConfig((teacher.lineRegion || "north") as LineRegion).token);
    } catch (error) {
      console.error(`[substitute] 代課通知發送失敗（${teacher.name}）：`, (error as Error).message);
    }
  };

  // LINE push 一次最多 5 則
  const assigned = plans.map((plan) => buildSubstituteAssignedMessage({ ...detailOf(plan.attendance), role }));
  for (let i = 0; i < assigned.length; i += 5) {
    await pushSafe(substitute, assigned.slice(i, i + 5));
  }

  const previousIds = [...new Set(plans.map((plan) => plan.previousTeacherId).filter((id): id is number => Boolean(id) && id !== substitute.id))];
  if (previousIds.length === 0) return;
  const previousTeachers = await prisma.teacher.findMany({
    where: { id: { in: previousIds } },
    select: { id: true, name: true, lineUserId: true, lineRegion: true },
  });
  for (const teacher of previousTeachers) {
    const messages = plans
      .filter((plan) => plan.previousTeacherId === teacher.id)
      .map((plan) => {
        const { date, time, school, courseType } = detailOf(plan.attendance);
        return buildSubstituteReplacedMessage({ date, time, school, courseType, role, substituteName: substitute.name });
      });
    for (let i = 0; i < messages.length; i += 5) {
      await pushSafe(teacher, messages.slice(i, i + 5));
    }
  }
}

export async function assignSubstitute(input: AssignmentInput) {
  const attendanceIds = [...new Set(input.attendanceIds.filter(Number.isFinite))];
  if (attendanceIds.length === 0) throw new Error("請選擇要代課的課堂");
  if (!Number.isFinite(input.substituteTeacherId)) throw new Error("請選擇代課老師");

  const [teacher, attendances] = await Promise.all([
    prisma.teacher.findUnique({
      where: { id: input.substituteTeacherId },
      select: { id: true, name: true, lineUserId: true, lineRegion: true },
    }),
    prisma.attendance.findMany({
      where: { id: { in: attendanceIds } },
      include: { course: true },
    }),
  ]);
  if (!teacher) throw new Error("找不到代課老師");
  if (attendances.length !== attendanceIds.length) throw new Error("部分課堂已不存在，請重新選擇");

  // 核准請假後課堂會先掛「待排老師」佔位帳號。助教的原老師若直接讀 assistantTeacherId，
  // 代課紀錄的 originalTeacherId 就會變成佔位帳號 —— 之後查不到原本該來的是誰，
  // 取消代課時也會把課還給佔位帳號而不是真正的助教。主教走 course.teacherId，不受影響。
  const waitingTeacherId = input.role === "助教" ? await findWaitingTeacherId() : null;

  const operations: Prisma.PrismaPromise<unknown>[] = [];
  const notifyPlans: NotifyPlan[] = [];
  for (const attendance of attendances) {
    if (attendance.cancelled) throw new Error(`${attendance.course.school} ${attendance.course.time} 已停課，不能安排代課`);
    if (attendance.isPayrollLocked) throw new Error(`${attendance.course.school} ${attendance.course.time} 已鎖定薪資，不能更換老師`);

    let originalTeacherId: number | null;
    if (input.role === "助教") {
      const realAssistantId = attendance.assistantTeacherId === waitingTeacherId ? null : attendance.assistantTeacherId;
      // 課程主檔也沒設助教時，退回這堂課還開著的那張假上的老師——請假的人就是原助教
      originalTeacherId = realAssistantId
        ?? attendance.course.assistantTeacherId
        ?? (await openLeaveForAttendance(attendance.id, "助教"))?.teacherId
        ?? null;
    } else {
      originalTeacherId = attendance.course.teacherId;
    }
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

    // 只有實際換人才通知。編輯代課費、備註而重呼叫這支時（PATCH /api/substitutes/[id]）
    // 老師不會被同一件事重複騷擾。
    const currentTeacherId = input.role === "助教" ? attendance.assistantTeacherId : attendance.actualTeacherId;
    if (currentTeacherId !== input.substituteTeacherId) {
      notifyPlans.push({ attendance, previousTeacherId: currentTeacherId ?? originalTeacherId });
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

  if (input.notify !== false && notifyPlans.length > 0) {
    await notifyAssignment(teacher, input.role, notifyPlans).catch((error) => {
      console.error("[substitute] 代課通知流程失敗：", (error as Error).message);
    });
  }

  return { updated: attendances.length, notified: notifyPlans.length };
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

  const originalTeacherId = record.originalTeacherId;
  if (!originalTeacherId) throw new Error("找不到原老師，無法取消代課");

  // 取消代課不等於原老師就能來上課。假還開著的話，課要退回「待排老師」而不是原老師——
  // 退回請假的人身上，這堂課又會被算進他的薪資、也會被請款給園所，
  // 但他人不會出現，而且沒有任何畫面會再提醒行政這堂課沒人上。
  const role: SubstituteRole = record.role === "助教" ? "助教" : "主教";
  const openLeave = await openLeaveForAttendance(record.attendanceId!, role);
  const backToPending = Boolean(openLeave && openLeave.teacherId === originalTeacherId);
  const restoreTeacherId = backToPending ? await ensureWaitingTeacherId() : originalTeacherId;

  await prisma.$transaction([
    prisma.attendance.update({
      where: { id: record.attendanceId!, isPayrollLocked: false },
      data: role === "助教"
        ? { assistantTeacherId: restoreTeacherId }
        : { actualTeacherId: restoreTeacherId },
    }),
    prisma.substitute.delete({ where: { id } }),
  ]);
  return { restored: true, pendingSubstitute: backToPending };
}
