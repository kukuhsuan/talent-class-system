import { prisma } from "@/lib/prisma";
import { effectiveAttendanceTime, usableScheduledTime } from "@/lib/attendanceTime";
import { normalizeCategory } from "@/lib/courseMeta";
import { salaryHoursFromValues } from "@/lib/salaryHours";
import { isWaitingTeacherName } from "@/lib/teacherAssignment";

export type SalaryDetail = {
  id: number;
  date: Date;
  school: string;
  courseType: string;
  category: string;
  hours: number;
  time: string;
  hoursNeedsReview: boolean;
  hoursReviewReason: string;
  rate: number;
  travelFee: number;
  amount: number;
  isSub: boolean;
  role: "主教" | "助教";
  department: string;
  notes: string;
};

export type SalaryAdjustmentRow = {
  id: number;
  teacherId: number;
  targetMonth: string;
  payoutMonth: string;
  type: string;
  amount: number;
  reason: string;
  notes: string;
  isPaid: boolean;
  paidAt: Date | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
};

type TeacherRow = {
  id: number; name: string; rateAfterSchool: number; rateInSchool: number; rateDemo: number;
  travelFee: number; isAssistant: boolean; assistantFee: number; email: string;
  lineUserId: string | null; lineRegion: string;
};

type AttendanceRow = {
  id: number; date: Date; actualTeacherId: number; assistantTeacherId: number | null;
  category: string; hours: number; notes: string; isPayrollLocked: boolean; reportContent: string; reportSentAt: Date | null;
  studentCount: number | null; studentCountA: number | null; studentCountB: number | null;
  scheduledTime: string | null;
  course: { id: number; school: string; courseType: string; teacherId: number; category: string; department: string; time: string; payrollHours: number | null };
};

export type SalaryResult = {
  teacher: TeacherRow;
  regularHours: number; subHours: number; demoHours: number; assistantHours: number;
  regularPay: number; demoPay: number; assistantPay: number; travelPay: number;
  adjustmentTotal: number; total: number; hoursReviewCount: number; hasActivity: boolean;
  /** 已計薪但尚未完成課後回報的堂數（政策：照算薪資，但列異常清單供行政核對） */
  unreportedCount: number;
  /** 未回報課堂摘要（日期 園所 課程），供薪資頁與異常清單顯示 */
  unreportedItems: string[];
  adjustments: SalaryAdjustmentRow[];
  details?: SalaryDetail[];
};

export async function calculateSalaryMonth(year: number, month: number, options: { teacherId?: number; includeDetails?: boolean } = {}) {
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 1);
  const payoutMonth = `${year}-${String(month).padStart(2, "0")}`;
  const teacherWhere = options.teacherId ? { id: options.teacherId } : undefined;
  const attendanceWhere = {
    date: { gte: start, lt: end },
    cancelled: false,
    ...(options.teacherId ? { OR: [{ actualTeacherId: options.teacherId }, { assistantTeacherId: options.teacherId }] } : {}),
  };

  const [teachersRaw, rowsRaw, adjustmentsRaw] = await Promise.all([
    prisma.teacher.findMany({ where: teacherWhere, orderBy: { name: "asc" } }),
    prisma.attendance.findMany({ where: attendanceWhere, include: { course: true }, orderBy: { date: "asc" } }),
    prisma.salaryAdjustment.findMany({
      where: { payoutMonth, ...(options.teacherId ? { teacherId: options.teacherId } : {}) },
      orderBy: [{ teacherId: "asc" }, { createdAt: "asc" }],
    }),
  ]);
  const teachers = teachersRaw as unknown as TeacherRow[];
  const rows = rowsRaw as unknown as AttendanceRow[];
  const adjustments = adjustmentsRaw as unknown as SalaryAdjustmentRow[];
  // scheduledTime / payrollHours 已在 schema 內，include 直接帶回，省 2 次資料庫來回
  const leadByTeacher = new Map<number, AttendanceRow[]>();
  const assistantByTeacher = new Map<number, AttendanceRow[]>();
  const adjustmentsByTeacher = new Map<number, SalaryAdjustmentRow[]>();
  for (const row of rows) {
    leadByTeacher.set(row.actualTeacherId, [...(leadByTeacher.get(row.actualTeacherId) ?? []), row]);
    if (row.assistantTeacherId) assistantByTeacher.set(row.assistantTeacherId, [...(assistantByTeacher.get(row.assistantTeacherId) ?? []), row]);
  }
  for (const adjustment of adjustments) adjustmentsByTeacher.set(adjustment.teacherId, [...(adjustmentsByTeacher.get(adjustment.teacherId) ?? []), adjustment]);

  const rowTime = (row: AttendanceRow) => effectiveAttendanceTime({
    scheduledTime: usableScheduledTime(row.scheduledTime),
    courseTime: row.course.time,
    attendanceHours: row.hours,
    isPayrollLocked: row.isPayrollLocked,
    reportContent: row.reportContent,
    reportSentAt: row.reportSentAt,
    studentCount: row.studentCount,
    studentCountA: row.studentCountA,
    studentCountB: row.studentCountB,
  });
  const salaryHours = (row: AttendanceRow) => salaryHoursFromValues(row.hours, row.course.payrollHours, rowTime(row));
  const detail = (row: AttendanceRow, teacher: TeacherRow, role: "主教" | "助教"): SalaryDetail => {
    const category = normalizeCategory(row.category);
    const isDemo = category === "Demo";
    const hours = salaryHours(row);
    const rate = role === "助教" ? teacher.assistantFee : isDemo ? teacher.rateDemo : category === "課內" ? teacher.rateInSchool : teacher.rateAfterSchool;
    const travelFee = role === "助教" || isDemo || hours.needsReview ? 0 : hours.payableHours * teacher.travelFee;
    return {
      id: role === "助教" ? -row.id : row.id, date: row.date, school: row.course.school,
      courseType: row.course.courseType, category, hours: hours.payableHours, time: hours.time,
      hoursNeedsReview: hours.needsReview, hoursReviewReason: hours.reason, rate, travelFee,
      amount: hours.payableHours * rate + travelFee,
      isSub: role === "主教" && row.course.teacherId !== teacher.id, role,
      department: row.course.department ?? "", notes: row.notes,
    };
  };

  const results: SalaryResult[] = teachers.filter((teacher) => !isWaitingTeacherName(teacher.name)).map((teacher) => {
    const lead = leadByTeacher.get(teacher.id) ?? [];
    const assistant = assistantByTeacher.get(teacher.id) ?? [];
    const details = [...lead.map((row) => detail(row, teacher, "主教")), ...assistant.map((row) => detail(row, teacher, "助教"))].sort((a, b) => a.date.getTime() - b.date.getTime());
    const regular = details.filter((row) => row.role === "主教" && row.category !== "Demo");
    const demo = details.filter((row) => row.role === "主教" && row.category === "Demo");
    const assistants = details.filter((row) => row.role === "助教");
    const teacherAdjustments = adjustmentsByTeacher.get(teacher.id) ?? [];
    const regularPay = regular.reduce((sum, row) => sum + row.hours * row.rate, 0);
    const demoPay = demo.reduce((sum, row) => sum + row.hours * row.rate, 0);
    const assistantPay = assistants.reduce((sum, row) => sum + row.hours * row.rate, 0);
    const travelPay = details.reduce((sum, row) => sum + row.travelFee, 0);
    const adjustmentTotal = teacherAdjustments.reduce((sum, row) => sum + row.amount, 0);
    // 未回報但已計薪的課（僅主教視角；已過課程日、回報內容為空）
    const now = new Date();
    const unreported = lead.filter((row) => row.date < now && !String(row.reportContent ?? "").trim());
    return {
      teacher,
      regularHours: regular.reduce((sum, row) => sum + row.hours, 0),
      subHours: regular.filter((row) => row.isSub).reduce((sum, row) => sum + row.hours, 0),
      demoHours: demo.reduce((sum, row) => sum + row.hours, 0),
      assistantHours: assistants.reduce((sum, row) => sum + row.hours, 0),
      regularPay, demoPay, assistantPay, travelPay, adjustmentTotal,
      total: regularPay + demoPay + assistantPay + travelPay + adjustmentTotal,
      hoursReviewCount: details.filter((row) => row.hoursNeedsReview).length,
      unreportedCount: unreported.length,
      unreportedItems: unreported.map((row) => `${row.date.toISOString().slice(0, 10)} ${row.course.school} ${row.course.courseType}`),
      hasActivity: details.length > 0 || teacherAdjustments.length > 0,
      adjustments: teacherAdjustments,
      ...(options.includeDetails ? { details } : {}),
    };
  });
  return { year, month, payoutMonth, results };
}
