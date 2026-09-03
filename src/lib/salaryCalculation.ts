import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { effectiveAttendanceTime, usableScheduledTime } from "@/lib/attendanceTime";
import { attendanceHoursOverrideMap } from "@/lib/attendanceHoursOverride";
import { normalizeCategory } from "@/lib/courseMeta";
import { salaryHoursFromValues } from "@/lib/salaryHours";
import { isWaitingTeacherName } from "@/lib/teacherAssignment";
import { visibleOperationalAttendanceWhere } from "@/lib/attendanceVisibility";

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
  // 樂觀鎖版本號，薪資頁刪除調整時要原樣帶回後端比對（見 src/lib/optimisticLock.ts）
  version: number;
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
  course: { id: number; school: string; courseType: string; teacherId: number; category: string; department: string; time: string; payrollHours: number | null; isActive: boolean };
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
  // 出勤日期以 YYYY-MM-DD 的 UTC 午夜儲存；固定用 UTC 月界線，避免 Vercel 時區造成跨月。
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  const payoutMonth = `${year}-${String(month).padStart(2, "0")}`;
  const teacherWhere = options.teacherId ? { id: options.teacherId } : undefined;
  const attendanceWhere: Prisma.AttendanceWhereInput = {
    date: { gte: start, lt: end },
    cancelled: false,
    AND: [
      // 封存代表不再參與日常排班，但已經上過、有回報資料的堂次仍要計薪——
      // 沿用出勤頁同一套「封存後仍保留真實紀錄」判斷（見 visibleOperationalAttendanceWhere），
      // 否則行政一封存課程，老師該月已上但未鎖薪的課就會憑空從薪資消失。
      visibleOperationalAttendanceWhere(),
      ...(options.teacherId
        ? [{ OR: [{ actualTeacherId: options.teacherId }, { assistantTeacherId: options.teacherId }] }]
        : []),
    ],
  };

  const [teachersRaw, rowsRaw, adjustmentsRaw] = await Promise.all([
    // 薪資頁只需要這些欄位。避免把履歷、聯絡資料、銀行資料等大型且敏感的
    // Teacher 欄位一起從 Turso 拉回，資料量會隨老師人數明顯放大。
    prisma.teacher.findMany({
      where: teacherWhere,
      select: {
        id: true,
        name: true,
        rateAfterSchool: true,
        rateInSchool: true,
        rateDemo: true,
        travelFee: true,
        isAssistant: true,
        assistantFee: true,
        email: true,
        lineUserId: true,
        lineRegion: true,
      },
      orderBy: { name: "asc" },
    }),
    // 同理，計薪只讀會參與公式的出勤與課程欄位；不要載入課程備註、地址、
    // 開課確認等與薪資無關的內容。
    prisma.attendance.findMany({
      where: attendanceWhere,
      select: {
        id: true,
        date: true,
        actualTeacherId: true,
        assistantTeacherId: true,
        category: true,
        hours: true,
        notes: true,
        isPayrollLocked: true,
        reportContent: true,
        reportSentAt: true,
        studentCount: true,
        studentCountA: true,
        studentCountB: true,
        scheduledTime: true,
        course: {
          select: {
            id: true,
            school: true,
            courseType: true,
            teacherId: true,
            category: true,
            department: true,
            time: true,
            payrollHours: true,
            isActive: true,
          },
        },
      },
      orderBy: { date: "asc" },
    }),
    prisma.salaryAdjustment.findMany({
      where: { payoutMonth, ...(options.teacherId ? { teacherId: options.teacherId } : {}) },
      orderBy: [{ teacherId: "asc" }, { createdAt: "asc" }],
    }),
  ]);
  const teachers = teachersRaw as unknown as TeacherRow[];
  const rows = rowsRaw as unknown as AttendanceRow[];
  const adjustments = adjustmentsRaw as unknown as SalaryAdjustmentRow[];
  // 哪些課的計薪時數是行政單堂改過的：這些要蓋過課程預設，否則改了等於沒改
  const hoursOverrideMap = await attendanceHoursOverrideMap(rows.map((row) => row.id));
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
  const salaryHours = (row: AttendanceRow) =>
    salaryHoursFromValues(row.hours, row.course.payrollHours, rowTime(row), hoursOverrideMap.get(row.id) === true);
  const detail = (row: AttendanceRow, teacher: TeacherRow, role: "主教" | "助教"): SalaryDetail => {
    const category = normalizeCategory(row.category);
    const isDemo = category === "Demo";
    const hours = salaryHours(row);
    const rate = role === "助教" ? teacher.assistantFee : isDemo ? teacher.rateDemo : category === "課內" ? teacher.rateInSchool : teacher.rateAfterSchool;
    // 車費是「每堂固定」，不隨時數變動：老師跑一趟就是一趟，上 1 小時和 2 小時的
    // 交通成本一樣。原本寫成 payableHours * travelFee，1.5 小時的課會發 1.5 倍車費。
    const travelFee = role === "助教" || isDemo || hours.needsReview ? 0 : teacher.travelFee;
    // 代課與原課都依老師對應身份的時薪 × 計薪時數計算。
    // Substitute.fee 是舊代課流程留下的參考欄位，代課頁也明示不會自動加入薪資；
    // 不得讓其中的殘值（例如 1）偷偷覆蓋正常薪資。特殊加給統一走 SalaryAdjustment，
    // 才會在薪資明細中留下可查核的補發／扣款紀錄。
    const teachingPay = hours.payableHours * rate;
    return {
      id: role === "助教" ? -row.id : row.id, date: row.date, school: row.course.school,
      courseType: row.course.courseType, category, hours: hours.payableHours, time: hours.time,
      hoursNeedsReview: hours.needsReview, hoursReviewReason: hours.reason, rate, travelFee,
      amount: teachingPay + travelFee,
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
    const teachingAmount = (row: SalaryDetail) => row.amount - row.travelFee;
    const regularPay = regular.reduce((sum, row) => sum + teachingAmount(row), 0);
    const demoPay = demo.reduce((sum, row) => sum + teachingAmount(row), 0);
    const assistantPay = assistants.reduce((sum, row) => sum + teachingAmount(row), 0);
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
