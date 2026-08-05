import { prisma } from "@/lib/prisma";
import { WAITING_TEACHER_NAME } from "@/lib/teacherAssignment";
import { OPEN_LEAVE_STATUSES } from "@/lib/leaveStatus";

// 「待指派代課」用既有的『待排老師』佔位帳號表示，不另外開欄位。
// 理由是全系統對這個帳號的排除規則都已經寫好了：
// salaryCalculation 直接把它從薪資名單濾掉、/api/salary/send 與 /api/salary/email 拒發、
// LINE 推播因為它沒有 lineUserId 自然不會送。改成新增布林欄位反而要把這些地方全部再補一次。
//
// 這支只能在伺服器端用（會碰 prisma）。teacherAssignment.ts 是給 client component import 的，
// 所以查詢邏輯放在這裡而不是那邊。

export type PendingRole = "主教" | "助教";

export async function findWaitingTeacherId(): Promise<number | null> {
  const row = await prisma.teacher.findUnique({
    where: { name: WAITING_TEACHER_NAME },
    select: { id: true },
  });
  return row?.id ?? null;
}

export async function ensureWaitingTeacherId(): Promise<number> {
  const existing = await findWaitingTeacherId();
  if (existing) return existing;
  try {
    const created = await prisma.teacher.create({
      data: { name: WAITING_TEACHER_NAME, notes: "系統建立，用於待指派代課與匯入後未排定的課程。" },
      select: { id: true },
    });
    return created.id;
  } catch {
    // name 是 unique：併發時可能已被另一個請求建好，重查一次即可
    const retry = await findWaitingTeacherId();
    if (!retry) throw new Error("無法建立待排老師佔位帳號");
    return retry;
  }
}

// 這堂課、這個角色上還開著的請假單。用來決定課該還給誰：
// 假還開著就還給佔位帳號，不能還給人不在的原老師。
export async function openLeaveForAttendance(attendanceId: number, role: PendingRole) {
  return prisma.teacherLeaveRequest.findFirst({
    where: { attendanceId, role, status: { in: OPEN_LEAVE_STATUSES } },
    select: { id: true, teacherId: true, status: true },
    orderBy: { id: "desc" },
  });
}

// 核准請假時呼叫：把課從請假老師身上拿下來，改掛佔位帳號。
// 不這樣做的話，這堂課到月底仍然算在請假老師名下——薪資會照發、請款也會照請，
// 而實際上沒有人去上這堂課。
export async function markAttendancePendingSubstitute(
  attendanceId: number,
  role: PendingRole,
  teacherOnLeaveId: number,
) {
  const attendance = await prisma.attendance.findUnique({
    where: { id: attendanceId },
    select: { id: true, cancelled: true, isPayrollLocked: true, actualTeacherId: true, assistantTeacherId: true },
  });
  if (!attendance) return { changed: false, reason: "找不到出勤紀錄" };
  if (attendance.cancelled) return { changed: false, reason: "課程已停課" };
  if (attendance.isPayrollLocked) return { changed: false, reason: "已鎖定薪資" };

  const current = role === "助教" ? attendance.assistantTeacherId : attendance.actualTeacherId;
  // 只有還掛在請假老師身上才動它。行政可能已經先手動指派代課了，那就別把人家換掉。
  if (current !== teacherOnLeaveId) return { changed: false, reason: "課堂已不是請假老師負責" };

  const waitingTeacherId = await ensureWaitingTeacherId();
  await prisma.attendance.update({
    where: { id: attendanceId, isPayrollLocked: false },
    data: role === "助教" ? { assistantTeacherId: waitingTeacherId } : { actualTeacherId: waitingTeacherId },
  });
  return { changed: true, reason: "" };
}

// 請假被駁回或老師自己取消時呼叫：把課還給原老師。
// 只有課還掛在佔位帳號上才還——已經有代課老師接手的話，
// 蓋回去等於把代課老師從課表上抹掉。
export async function restoreAttendanceTeacher(
  attendanceId: number,
  role: PendingRole,
  teacherId: number,
) {
  const waitingTeacherId = await findWaitingTeacherId();
  if (!waitingTeacherId) return { changed: false, reason: "沒有待排老師佔位帳號" };

  const attendance = await prisma.attendance.findUnique({
    where: { id: attendanceId },
    select: { id: true, isPayrollLocked: true, actualTeacherId: true, assistantTeacherId: true },
  });
  if (!attendance) return { changed: false, reason: "找不到出勤紀錄" };
  if (attendance.isPayrollLocked) return { changed: false, reason: "已鎖定薪資" };

  const current = role === "助教" ? attendance.assistantTeacherId : attendance.actualTeacherId;
  if (current !== waitingTeacherId) return { changed: false, reason: "課堂已另有安排" };

  // 同一堂課可能同時有別張還沒結案的假（例如駁回這張、但老師又補提一張）
  const stillOpen = await openLeaveForAttendance(attendanceId, role);
  if (stillOpen) return { changed: false, reason: `仍有未結案的請假單（${stillOpen.status}）` };

  await prisma.attendance.update({
    where: { id: attendanceId, isPayrollLocked: false },
    data: role === "助教" ? { assistantTeacherId: teacherId } : { actualTeacherId: teacherId },
  });
  return { changed: true, reason: "" };
}
