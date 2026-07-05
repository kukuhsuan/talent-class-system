import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseAttendanceDay } from "@/lib/attendanceBatch";
import { ensureAttendanceScheduledTimeColumn, stampAttendanceTime } from "@/lib/attendanceTime";
import { normalizeCategory, requiresStudentCount } from "@/lib/courseMeta";
import { coursePayrollHoursForAttendance, coursePayrollHoursMap } from "@/lib/payrollHours";
import { parsePayrollHours } from "@/lib/payrollHoursCore";
import { deleteAttendanceEquipment, parseEquipmentInput, saveAttendanceEquipment } from "@/lib/equipmentReminder";
import { diffSummary, writeAuditLog } from "@/lib/auditLog";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await req.json();
  const { makeupDate, assistantTeacherId, confirmCompleted, scheduledTime, equipment, ...rest } = data;
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
  const notes = String(rest.notes ?? current.notes ?? "");
  const requestedHours = parsePayrollHours(rest.hours);
  const category = rest.category ? normalizeCategory(rest.category) : current.category;
  const reportContent = confirmCompleted === true && !requiresStudentCount(category) && !rest.cancelled
    ? current.reportContent?.trim() || "後台確認出課"
    : current.reportContent;
  const record = await prisma.attendance.update({
    where: { id: Number(id) },
    data: {
      ...rest,
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
  });
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
