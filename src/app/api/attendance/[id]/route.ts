import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseAttendanceDay } from "@/lib/attendanceBatch";
import { ensureAttendanceScheduledTimeColumn, stampAttendanceTime } from "@/lib/attendanceTime";
import { normalizeCategory, requiresStudentCount } from "@/lib/courseMeta";
import { coursePayrollHoursForAttendance, coursePayrollHoursMap } from "@/lib/payrollHours";
import { parsePayrollHours } from "@/lib/payrollHoursCore";
import { setAttendanceHoursOverride } from "@/lib/attendanceHoursOverride";
import { deleteAttendanceEquipment, parseEquipmentInput, saveAttendanceEquipment } from "@/lib/equipmentReminder";
import { parseExpectedStudentCount, setExpectedStudentCount } from "@/lib/expectedStudentCount";
import { diffSummary, writeAuditLog } from "@/lib/auditLog";
import { syncSubstituteWithAttendance } from "@/lib/substituteAssignment";
import { schoolSignatureMap } from "@/lib/schoolSignature";
import { invalidVersionResponse, isRecordNotFound, parseExpectedVersion, versionConflictResponse, versionWhere } from "@/lib/optimisticLock";

// 單堂出勤（供電子簽到表列印頁使用）
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const attendanceId = Number(id);
  if (!Number.isFinite(attendanceId)) return NextResponse.json({ error: "編號不正確" }, { status: 400 });
  const record = await prisma.attendance.findUnique({
    where: { id: attendanceId },
    include: {
      course: { select: { school: true, courseType: true, time: true } },
      actualTeacher: { select: { name: true } },
    },
  });
  if (!record) return NextResponse.json({ error: "找不到這筆上課紀錄" }, { status: 404 });
  const signature = (await schoolSignatureMap([record.id])).get(record.id);
  return NextResponse.json({
    id: record.id,
    date: record.date,
    cancelled: record.cancelled,
    hours: record.hours,
    studentCount: record.studentCount,
    scheduledTime: record.scheduledTime ?? "",
    // 版本衝突後前端要靠這支把最新版本號抓回表單，沒有它使用者會卡在重複的 409
    version: record.version,
    course: record.course,
    actualTeacher: record.actualTeacher,
    schoolVerifierName: signature?.schoolVerifierName ?? "",
    schoolSignatureData: signature?.schoolSignatureData ?? "",
    schoolSignedAt: signature?.schoolSignedAt ?? null,
  });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await req.json();
  const { makeupDate, assistantTeacherId, confirmCompleted, scheduledTime, equipment, expectedStudentCount } = data;
  const current = await prisma.attendance.findUnique({
    where: { id: Number(id) },
    include: { course: { select: { id: true, code: true, school: true, courseType: true, time: true } }, actualTeacher: { select: { id: true, name: true } }, assistantTeacher: { select: { id: true, name: true } } },
  });
  if (!current) return NextResponse.json({ error: "找不到出勤紀錄" }, { status: 404 });
  if (current.isPayrollLocked) {
    return NextResponse.json({ error: "此筆出勤已鎖定薪資，請先解除鎖定後再編輯" }, { status: 409 });
  }
  const courseId = data.courseId ? Number(data.courseId) : current.courseId;
  const course = courseId
    ? await prisma.course.findUnique({ where: { id: courseId }, select: { id: true, time: true } })
    : null;
  const payrollMap = await coursePayrollHoursMap(course ? [course.id] : []);
  const calculatedHours = coursePayrollHoursForAttendance(courseId ? payrollMap.get(courseId) : null, course?.time ?? "");
  const notes = String(data.notes ?? current.notes ?? "");
  const requestedHours = parsePayrollHours(data.hours);
  const category = data.category ? normalizeCategory(data.category) : current.category;
  const cancelled = data.cancelled === undefined ? current.cancelled : Boolean(data.cancelled);
  const reportContent = confirmCompleted === true && !requiresStudentCount(category) && !cancelled
    ? current.reportContent?.trim() || "後台確認出課"
    : current.reportContent;
  // 樂觀鎖：這裡的 data 是「整份表單覆蓋」，沒帶的欄位一律用 current 的值回填。
  // 表單開著的期間老師若用 LINE 回報了人數，current 已經是舊的，存下去等於把回報清掉。
  const expectedVersion = parseExpectedVersion(data.version);
  if (expectedVersion === null) return invalidVersionResponse();
  const record = await prisma.attendance.update({
    where: versionWhere({ id: Number(id) }, expectedVersion),
    data: {
      courseId,
      actualTeacherId: data.actualTeacherId === undefined ? current.actualTeacherId : Number(data.actualTeacherId),
      studentCount: data.studentCount === undefined ? current.studentCount : data.studentCount === "" ? null : Number(data.studentCount),
      studentCountA: data.studentCountA === undefined ? current.studentCountA : data.studentCountA === "" ? null : Number(data.studentCountA),
      studentCountB: data.studentCountB === undefined ? current.studentCountB : data.studentCountB === "" ? null : Number(data.studentCountB),
      cancelled,
      cancelReason: data.cancelReason === undefined ? current.cancelReason : String(data.cancelReason ?? ""),
      makeupDone: data.makeupDone === undefined ? current.makeupDone : Boolean(data.makeupDone),
      hours: requestedHours ?? calculatedHours.hours,
      notes: calculatedHours.needsReview && !notes.includes("上課時間需人工確認")
        ? [notes, `上課時間需人工確認：${calculatedHours.reason}`].filter(Boolean).join("；")
        : notes,
      assistantTeacherId: assistantTeacherId === "" || assistantTeacherId === undefined || assistantTeacherId === null ? null : Number(assistantTeacherId),
      date: data.date ? parseAttendanceDay(String(data.date).slice(0, 10)) : undefined,
      category,
      reportContent,
      makeupDate: makeupDate ? parseAttendanceDay(String(makeupDate).slice(0, 10)) : null,
    },
    include: { course: { include: { assistantTeacher: true } }, actualTeacher: true, assistantTeacher: true },
    // 樂觀鎖沒過時 Prisma 會丟 P2025。上面已經確認過這筆出勤存在，
    // 所以這裡的「找不到」只可能是 version 對不上。
  }).catch((error: unknown) => {
    if (isRecordNotFound(error)) return null;
    throw error;
  });
  if (!record) return versionConflictResponse("這堂課剛被老師回報或其他人編輯過");
  // 後台直接改老師時，同步代課紀錄（通知一律以出勤為主，避免發給錯的老師）
  if (record.actualTeacherId !== current.actualTeacherId) {
    await syncSubstituteWithAttendance(record.id, "主教", record.actualTeacherId);
  }
  if (record.assistantTeacherId !== current.assistantTeacherId) {
    await syncSubstituteWithAttendance(record.id, "助教", record.assistantTeacherId);
  }
  // 計薪時數的人工覆蓋：行政特地為這一堂填了和課程預設不同的數字，就標記起來，
  // 讓薪資計算以這一堂為準（沒有這個標記，改了畫面但薪資不會變）。
  // 填的數字和課程預設相同、或整個清空，視為「回到課程預設」，清除標記。
  if (data.hours !== undefined) {
    await setAttendanceHoursOverride(
      record.id,
      requestedHours !== null && requestedHours !== calculatedHours.hours,
    );
  }
  if (typeof scheduledTime === "string") {
    await ensureAttendanceScheduledTimeColumn();
    await prisma.$executeRawUnsafe(
      `UPDATE "Attendance" SET "scheduledTime" = ? WHERE "id" = ?`,
      scheduledTime,
      Number(id),
    );
  } else {
    await stampAttendanceTime(record.courseId, [record.date.toISOString().slice(0, 10)], record.course.time);
  }
  // 器材提醒設定（有帶 equipment 才更新；全空白等於清除）
  const equipmentInput = parseEquipmentInput(equipment);
  const equipmentRow = equipmentInput ? await saveAttendanceEquipment(record.id, equipmentInput) : undefined;
  // 預計人數（有帶才更新；空字串 = 清除）
  const expectedCount = parseExpectedStudentCount(expectedStudentCount);
  if (expectedCount !== undefined) await setExpectedStudentCount([record.id], expectedCount);
  await writeAuditLog(req, {
    action: "update",
    targetType: "Attendance",
    targetId: record.id,
    targetLabel: `${record.date.toISOString().slice(0, 10)} ${record.course.school} ${record.course.courseType}`,
    beforeData: current,
    afterData: record,
    diffSummary: diffSummary(current as unknown as Record<string, unknown>, record as unknown as Record<string, unknown>, {
      actualTeacherId: "主教",
      assistantTeacherId: "助教",
      studentCount: "出席人數",
      hours: "計薪時數",
      cancelled: "停課",
      category: "類別",
      date: "日期",
    }) || `修改出勤紀錄：${record.date.toISOString().slice(0, 10)} ${record.course.school}`,
    sensitive: true,
  });
  return NextResponse.json(equipmentRow === undefined ? record : { ...record, equipment: equipmentRow });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const current = await prisma.attendance.findUnique({
    where: { id: Number(id) },
    include: { course: { select: { id: true, code: true, school: true, courseType: true } }, actualTeacher: { select: { id: true, name: true } } },
  });
  if (!current) return NextResponse.json({ error: "找不到出勤紀錄" }, { status: 404 });
  if (current.isPayrollLocked) {
    return NextResponse.json({ error: "此筆出勤已鎖定薪資，不可刪除" }, { status: 409 });
  }
  const [leaveRows, substituteCount, changeTargetCount] = await Promise.all([
    prisma.$queryRawUnsafe<Array<{ id: number; status: string }>>(
      `SELECT "id", "status" FROM "TeacherLeaveRequest" WHERE "attendanceId" = ? LIMIT 5`,
      Number(id),
    ).catch(() => []),
    prisma.substitute.count({ where: { attendanceId: Number(id) } }),
    prisma.courseChangeRequestTarget.count({ where: { attendanceId: Number(id) } }),
  ]);
  if (leaveRows.length || substituteCount || changeTargetCount) {
    const relations = [
      leaveRows.length ? `請假申請 ${leaveRows.length} 筆` : "",
      substituteCount ? `代課紀錄 ${substituteCount} 筆` : "",
      changeTargetCount ? `課程異動 ${changeTargetCount} 筆` : "",
    ].filter(Boolean).join("、");
    return NextResponse.json({ error: `此筆出勤仍關聯${relations}，請先完成或取消相關流程後再刪除` }, { status: 409 });
  }
  await deleteAttendanceEquipment(Number(id));
  await prisma.attendance.delete({ where: { id: Number(id) } });
  await writeAuditLog(req, {
    action: "delete",
    targetType: "Attendance",
    targetId: id,
    targetLabel: `${current.date.toISOString().slice(0, 10)} ${current.course.school} ${current.course.courseType}`,
    beforeData: current,
    diffSummary: `刪除出勤紀錄：${current.date.toISOString().slice(0, 10)} ${current.course.school}`,
    sensitive: true,
  });
  return NextResponse.json({ ok: true });
}
