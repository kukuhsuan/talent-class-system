import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { notifySchoolReport } from "@/lib/schoolNotification";
import {
  LineRegion, getLineConfig, verifyLineSignature,
  replyMessage,
  buildReportRequestMessage, buildCurriculumSelectMessage, buildStudentCountBoard, buildTwoMonthScheduleMessage, generateBindCode,
  buildLeaveCourseSelectMessage, buildLeaveCancelSelectMessage,
  buildEquipmentFlowAcceptedMessage,
  isSchoolLineRegion,
} from "@/lib/line";
import { formatMonthDay, taipeiDateIso, weekdayOfIso } from "@/lib/courseDates";
import { courseIdsWithAnyAttendance, dayBounds, dayNameOfIso } from "@/lib/scheduleLogic";
import { attendanceScheduledTimeMap, effectiveAttendanceTime, stampAttendanceTime, usableScheduledTime } from "@/lib/attendanceTime";
import { courseLabel, normalizeCategory, requiresStudentCount } from "@/lib/courseMeta";
import { attendanceHoursFromCourseTime } from "@/lib/courseHours";
import { attendanceReportWindow, isPendingReport, REPORT_NOT_STARTED_MESSAGE } from "@/lib/reportWindow";
import { recordTeacherArrival } from "@/lib/attendanceArrival";
import { courseConfirmationMapBySchoolIds, courseConfirmationSummary } from "@/lib/courseConfirmation";
import {
  cancellableLeaveChoices,
  cancelLeaveRequestByTeacher,
  createLeaveRequestFromAttendance,
  getInquiryWithLeave,
  INQUIRY_STATUS,
  LEAVE_STATUS,
  semesterLeaveCount,
  updateInquiryResponse,
  upcomingLeaveCourseChoices,
} from "@/lib/teacherLeaves";
import { setEquipmentStatus } from "@/lib/equipmentReminder";
import { equipmentNextStopLabel, type EquipmentStatus } from "@/lib/equipmentReminderCore";
import { getEquipmentFlow, updateEquipmentFlowStatus } from "@/lib/equipmentFlow";
import { diffSummary, writeAuditLog } from "@/lib/auditLog";
import { pushAdminAlert, raiseSystemAlert } from "@/lib/systemAlerts";
import { respondToCourseChange } from "@/lib/courseChangeRequests";

type LineEvent = {
  type: string;
  replyToken?: string;
  source: { userId: string };
  message?: { type: string; text: string };
  postback?: { data: string };
};

// Track teachers mid-report (userId -> attendanceId awaiting detail)
const pendingDetails = new Map<string, number>();
// Track teachers who've submitted A班, now awaiting B班 (userId -> attendanceId)
const pendingGroupB = new Map<string, number>();
// Track teachers who selected a leave course and now need to type a reason.
const pendingLeaveApplications = new Map<string, number>();
const UNAUTHORIZED_ATTENDANCE_REPLY = "此課程資料無法由您的帳號回報，請聯繫行政確認。";

async function teacherCanAccessAttendance(lineUserId: string, attendanceId: number) {
  if (!Number.isFinite(attendanceId) || attendanceId <= 0) return false;
  const teacher = await prisma.teacher.findFirst({
    where: { lineUserId },
    select: { id: true },
  });
  if (!teacher) return false;

  const attendance = await prisma.attendance.findUnique({
    where: { id: attendanceId },
    select: {
      actualTeacherId: true,
      assistantTeacherId: true,
      substitutes: {
        select: {
          substituteTeacherId: true,
          confirmed: true,
        },
      },
    },
  });
  if (!attendance) return false;
  return attendance.actualTeacherId === teacher.id
    || attendance.assistantTeacherId === teacher.id
    || attendance.substitutes.some((substitute) => substitute.confirmed && substitute.substituteTeacherId === teacher.id);
}

async function ensureTeacherCanAccessAttendance(lineUserId: string, attendanceId: number, replyToken: string, token: string) {
  if (await teacherCanAccessAttendance(lineUserId, attendanceId)) return true;
  await replyMessage(replyToken, [{ type: "text", text: UNAUTHORIZED_ATTENDANCE_REPLY }], token);
  return false;
}

async function ensureTeacherCanSubmitReport(lineUserId: string, attendanceId: number, replyToken: string, token: string) {
  if (!(await teacherCanAccessAttendance(lineUserId, attendanceId))) {
    await replyMessage(replyToken, [{ type: "text", text: UNAUTHORIZED_ATTENDANCE_REPLY }], token);
    return false;
  }
  const attendance = await prisma.attendance.findUnique({
    where: { id: attendanceId },
    include: { course: true },
  });
  if (!attendance) {
    await replyMessage(replyToken, [{ type: "text", text: "找不到課程資料，請聯繫行政確認。" }], token);
    return false;
  }
  const scheduledTime = effectiveAttendanceTime({
    scheduledTime: usableScheduledTime(attendance.scheduledTime),
    courseTime: attendance.course.time,
    attendanceHours: attendance.hours,
    isPayrollLocked: attendance.isPayrollLocked,
    reportContent: attendance.reportContent,
    reportSentAt: attendance.reportSentAt,
    studentCount: attendance.studentCount,
    studentCountA: attendance.studentCountA,
    studentCountB: attendance.studentCountB,
  });
  if (!attendanceReportWindow(attendance, scheduledTime).ended) {
    await replyMessage(replyToken, [{ type: "text", text: REPORT_NOT_STARTED_MESSAGE }], token);
    return false;
  }
  return true;
}

async function ensureSchoolLineRegionColumn() {
  await prisma.$executeRawUnsafe('ALTER TABLE School ADD COLUMN lineRegion TEXT NOT NULL DEFAULT "school"').catch(() => undefined);
}

export async function handleWebhook(req: NextRequest, region: LineRegion) {
  const body = await req.text();
  const sig = req.headers.get("x-line-signature") ?? "";
  const cfg = getLineConfig(region);

  if (!verifyLineSignature(body, sig, cfg.secret)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { events } = JSON.parse(body) as { events: LineEvent[] };

  for (const event of events) {
    const userId = event.source.userId;
    if (event.type === "message" && event.message?.type === "text") {
      const text = event.message.text.trim();
      await handleText(userId, text, event.replyToken!, region, cfg.token);
    } else if (event.type === "postback" && event.postback) {
      await handlePostback(userId, event.postback.data, event.replyToken!, region, cfg.token);
    } else if (event.type === "follow") {
      await handleFollow(userId, event.replyToken!, cfg.token, region);
    }
  }

  return new NextResponse("OK");
}

async function handleFollow(userId: string, replyToken: string, token: string, region: LineRegion) {
  if (isSchoolLineRegion(region)) {
    await ensureSchoolLineRegionColumn();
    const school = await prisma.school.findFirst({ where: { lineUserId: userId } } as never) as { name: string } | null;
    if (school) {
      await replyMessage(replyToken, [{ type: "text", text: `歡迎回來，${school.name}！課程回報將會傳送到這裡。` }], token);
      return;
    }
    await replyMessage(replyToken, [{ type: "text", text: "歡迎！請傳送您的園所綁定碼（6位英數字），即可開始接收課程回報。" }], token);
  } else {
    const teacher = await prisma.teacher.findFirst({ where: { lineUserId: userId } } as never) as { id: number; name: string } | null;
    if (teacher) {
      await prisma.teacher.update({ where: { id: teacher.id }, data: { lineRegion: region } } as never);
      await replyMessage(replyToken, [{
        type: "text",
        text: `歡迎，${teacher.name} 老師！✅ 已自動完成綁定。\n\n傳送「報課」可查看今日課程並回報。`,
      }], token);
      return;
    }
    await replyMessage(replyToken, [{
      type: "text",
      text: "歡迎加入！請傳送您的老師綁定碼（6位英數字），管理員可在系統「通知管理」頁面取得您的綁定碼。",
    }], token);
  }
}

async function handleText(userId: string, text: string, replyToken: string, region: LineRegion, token: string) {
  // Check if waiting for detailed report
  const pendingId = pendingDetails.get(userId);
  if (pendingId) {
    pendingDetails.delete(userId);
    if (!(await ensureTeacherCanSubmitReport(userId, pendingId, replyToken, token))) return;
    await saveDetailedReport(userId, pendingId, text, replyToken, token, region);
    return;
  }

  const pendingLeaveAttendanceId = pendingLeaveApplications.get(userId);
  if (pendingLeaveAttendanceId) {
    if (!text.trim()) {
      await replyMessage(replyToken, [{ type: "text", text: "請輸入請假原因，原因為必填。" }], token);
      return;
    }
    const teacher = await prisma.teacher.findFirst({ where: { lineUserId: userId } } as never) as { id: number; name: string } | null;
    if (!teacher) {
      pendingLeaveApplications.delete(userId);
      await replyMessage(replyToken, [{ type: "text", text: "找不到您的老師資料，請先完成綁定。" }], token);
      return;
    }
    try {
      const result = await createLeaveRequestFromAttendance({
        attendanceId: pendingLeaveAttendanceId,
        teacherId: teacher.id,
        reason: text,
      });
      pendingLeaveApplications.delete(userId);
      await replyMessage(replyToken, [{
        type: "text",
        text: `✅ 已送出請假申請，行政審核後會再通知您。\n本學期請假累計：${result.semesterLeaveCountAtSubmit} 次。\n\n若要取消請假，請傳「取消請假」。`,
      }], token);
    } catch (error) {
      pendingLeaveApplications.delete(userId);
      await replyMessage(replyToken, [{ type: "text", text: (error as Error).message || "請假申請送出失敗，請稍後再試。" }], token);
    }
    return;
  }

  if (text === "取消請假" || text === "取消請假申請") {
    const teacher = await prisma.teacher.findFirst({ where: { lineUserId: userId } } as never) as { id: number; name: string } | null;
    if (!teacher) {
      await replyMessage(replyToken, [{ type: "text", text: "找不到您的老師資料，請先完成綁定。" }], token);
      return;
    }
    const leaves = await cancellableLeaveChoices(teacher.id);
    if (leaves.length === 0) {
      await replyMessage(replyToken, [{ type: "text", text: `${teacher.name} 老師，目前沒有可取消的請假申請。` }], token);
      return;
    }
    await replyMessage(replyToken, [buildLeaveCancelSelectMessage({
      teacherName: teacher.name,
      leaves,
    })], token);
    return;
  }

  if (["到校", "已到校", "抵達", "已抵達", "打卡", "到校打卡"].includes(text)) {
    const result = await recordTeacherArrival(userId);
    await replyMessage(replyToken, [{ type: "text", text: result.message }], token);
    return;
  }

  if (text === "申請請假" || text === "請假") {
    const teacher = await prisma.teacher.findFirst({ where: { lineUserId: userId } } as never) as { id: number; name: string } | null;
    if (!teacher) {
      await replyMessage(replyToken, [{ type: "text", text: "找不到您的老師資料，請先完成綁定。" }], token);
      return;
    }
    const [courses, leaveCount] = await Promise.all([
      upcomingLeaveCourseChoices(teacher.id, 25),
      semesterLeaveCount(teacher.id),
    ]);
    if (courses.length === 0) {
      await replyMessage(replyToken, [{ type: "text", text: `${teacher.name} 老師，目前找不到本月與下個月可申請請假的課程。若課程尚未建立出勤紀錄，請聯絡行政協助。` }], token);
      return;
    }
    await replyMessage(replyToken, [buildLeaveCourseSelectMessage({
      teacherName: teacher.name,
      semesterLeaveCount: leaveCount,
      courses,
    })], token);
    return;
  }

  // Self-report trigger: teacher types "報課"
  if (text === "報課") {
    const teacher = await prisma.teacher.findFirst({ where: { lineUserId: userId } } as never) as { id: number; name: string } | null;
    if (!teacher) {
      await replyMessage(replyToken, [{ type: "text", text: "找不到您的老師資料，請先完成綁定。" }], token);
      return;
    }
    const todayIso = taipeiDateIso();
    const { start: todayStart, end: todayEnd } = dayBounds(todayIso);
    const todayDay = dayNameOfIso(todayIso);

    // === 第一優先：過去 48 小時內未回報課程 ===
    const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const pastRaw = await (prisma.attendance.findMany({
      where: {
        actualTeacherId: teacher.id,
        cancelled: false,
        date: { gte: fortyEightHoursAgo, lt: todayStart },
        course: { isActive: true },
        OR: [
          { studentCount: null, studentCountA: null, studentCountB: null },
          { reportContent: "" },
        ],
      },
      include: { course: true },
    }) as unknown as Promise<Array<{
      id: number; date: Date; category: string; hours: number; scheduledSchoolName?: string | null;
      studentCount: number | null; studentCountA: number | null; studentCountB: number | null;
      reportContent: string; reportSentAt?: Date | null; isPayrollLocked?: boolean; cancelled: boolean;
      course: { id: number; school: string; courseType: string; category: string; department: string; time: string };
    }>>);
    const pastScheduledTimeMap = await attendanceScheduledTimeMap(pastRaw.map((a) => a.id));
    const pendingPast = pastRaw.filter((att) => {
      const scheduledTime = effectiveAttendanceTime({
        scheduledTime: pastScheduledTimeMap.get(att.id),
        courseTime: att.course.time,
        attendanceHours: att.hours,
        isPayrollLocked: att.isPayrollLocked,
        reportContent: att.reportContent,
        reportSentAt: att.reportSentAt,
        studentCount: att.studentCount,
        studentCountA: att.studentCountA,
        studentCountB: att.studentCountB,
      });
      return isPendingReport(att, scheduledTime);
    });

    // === 第二優先：今日課程 ===
    const datedCourseIds = await courseIdsWithAnyAttendance({ teacherId: teacher.id, isActive: true }, todayStart);
    const [scheduledAttendances, weekdayCourses] = await Promise.all([
      prisma.attendance.findMany({
        where: {
          actualTeacherId: teacher.id,
          cancelled: false,
          date: { gte: todayStart, lt: todayEnd },
          course: { isActive: true },
        },
        include: { course: true },
      }) as unknown as Promise<Array<{ id: number; scheduledSchoolName?: string | null; course: { id: number; school: string; courseType: string; category: string; department: string; time: string } }>>,
      prisma.course.findMany({
        where: {
          teacherId: teacher.id,
          dayOfWeek: todayDay,
          isActive: true,
          ...(datedCourseIds.size > 0 ? { id: { notIn: [...datedCourseIds] } } : {}),
        },
      }) as unknown as Promise<Array<{ id: number; school: string; courseType: string; category: string; department: string; time: string }>>,
    ]);

    // 全無 → 明確告知
    if (pendingPast.length === 0 && scheduledAttendances.length === 0 && weekdayCourses.length === 0) {
      await replyMessage(replyToken, [{ type: "text", text: `${teacher.name} 老師，目前沒有待回報課程。` }], token);
      return;
    }

    const atts: Array<{ id: number; school: string; courseType: string; department: string; dateLabel?: string }> = [];

    // 過去待回報優先放入
    for (const att of pendingPast) {
      const iso = att.date instanceof Date ? att.date.toISOString().slice(0, 10) : String(att.date).slice(0, 10);
      atts.push({ id: att.id, school: att.scheduledSchoolName?.trim() || att.course.school, courseType: att.course.courseType, department: att.course.department, dateLabel: formatMonthDay(iso) });
    }

    // 今日課程
    for (const att of scheduledAttendances) {
      atts.push({ id: att.id, school: att.scheduledSchoolName?.trim() || att.course.school, courseType: att.course.courseType, department: att.course.department });
    }
    for (const course of weekdayCourses) {
      let att = await prisma.attendance.findFirst({
        where: { courseId: course.id, date: { gte: todayStart, lt: todayEnd } },
      }) as { id: number } | null;
      if (!att) {
        const calculatedHours = attendanceHoursFromCourseTime((course as { time?: string }).time ?? "");
        att = await prisma.attendance.create({
          data: {
            date: todayStart,
            courseId: course.id,
            actualTeacherId: teacher.id,
            category: normalizeCategory(course.category),
            hours: calculatedHours.hours,
            notes: calculatedHours.needsReview ? `上課時間需人工確認：${calculatedHours.reason}` : "",
          },
        }) as { id: number };
        await stampAttendanceTime(course.id, [todayIso], course.time ?? "");
      }
      atts.push({ id: att.id, school: course.school, courseType: course.courseType, department: course.department });
    }

    // 組合回覆文字
    const pastCount = pendingPast.length;
    const todayCount = scheduledAttendances.length + weekdayCourses.length;
    let introText: string;
    if (pastCount > 0 && todayCount > 0) {
      introText = `${teacher.name} 老師，您有 ${pastCount} 堂課程尚未完成回報（48小時補報期限內），加上今天 ${todayCount} 堂，請依序回報：`;
    } else if (pastCount > 0) {
      introText = `${teacher.name} 老師，您有 ${pastCount} 堂課程仍在 48 小時補報期限內，請完成回報：`;
    } else {
      introText = `${teacher.name} 老師，您今天有 ${atts.length} 堂課，請依序回報：`;
    }

    const replyMsgs: object[] = [{ type: "text", text: introText }];
    for (const a of atts.slice(0, 3)) {
      replyMsgs.push(buildReportRequestMessage({ school: a.school, courseType: a.courseType, attendanceId: a.id }));
    }
    await replyMessage(replyToken, replyMsgs, token);
    return;
  }

  // Teacher queries their own schedule: "課表" or "查課表"
  if (text === "課表" || text === "查課表") {
    const teacher = await prisma.teacher.findFirst({ where: { lineUserId: userId } } as never) as { id: number; name: string } | null;
    if (!teacher) {
      await replyMessage(replyToken, [{ type: "text", text: "找不到您的老師資料，請先完成綁定。" }], token);
      return;
    }
    const courses = await prisma.course.findMany({
      where: { teacherId: teacher.id, isActive: true },
      include: { schoolRel: true },
    }) as unknown as Array<{ id: number; schoolId?: number | null; school: string; courseType: string; dayOfWeek: string; time: string; department: string; address?: string; schoolRel?: { address?: string } | null }>;

    const DAY_JS: Record<string, number> = {
      "星期一": 1, "星期二": 2, "星期三": 3, "星期四": 4,
      "星期五": 5, "星期六": 6, "星期日": 0,
    };
    const now = new Date();
    const targetYear = now.getFullYear();

    const displayMonthIndexes = [6, 7, 8];
    const periodStart = new Date(targetYear, displayMonthIndexes[0], 1);
    const periodEnd = new Date(targetYear, displayMonthIndexes[displayMonthIndexes.length - 1] + 1, 0, 23, 59, 59, 999);

    const actualRows = await prisma.attendance.findMany({
      where: {
        OR: [{ actualTeacherId: teacher.id }, { assistantTeacherId: teacher.id }],
        cancelled: false,
        date: { gte: periodStart, lte: periodEnd },
      },
      include: { course: { include: { schoolRel: true } } },
      orderBy: { date: "asc" },
    }) as unknown as Array<{
      id: number; hours?: number; isPayrollLocked?: boolean; reportContent?: string; reportSentAt?: Date | null; scheduledSchoolId?: number | null; scheduledSchoolName?: string | null; scheduledAddress?: string | null;
      studentCount?: number | null; studentCountA?: number | null; studentCountB?: number | null;
      date: Date;
      course: { id: number; schoolId?: number | null; school: string; courseType: string; time: string; address?: string; schoolRel?: { address?: string } | null };
    }>;
    if (courses.length === 0 && actualRows.length === 0) {
      await replyMessage(replyToken, [{ type: "text", text: `${teacher.name} 老師，目前沒有排定的課程。` }], token);
      return;
    }
    const actualTimeMap = await attendanceScheduledTimeMap(actualRows.map((row) => row.id));
    const confirmationMap = await courseConfirmationMapBySchoolIds([
      ...courses.map((course) => course.schoolId ?? 0),
      ...actualRows.map((row) => row.scheduledSchoolId ?? row.course.schoolId ?? 0),
    ]);
    const confirmationSummaryFor = (schoolId?: number | null) => schoolId
      ? courseConfirmationSummary(confirmationMap.get(schoolId), { multiline: true, teacher: true })
      : "";

    const fmt = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`;

    const displayCourses = courses;
    const displayCourseIds = new Set(displayCourses.map((course) => course.id));
    const scheduleNearDate = new Date();
    const datedCourseIds = displayCourseIds.size > 0
      ? await courseIdsWithAnyAttendance({
        isActive: true,
        id: { in: [...displayCourseIds] },
      }, scheduleNearDate)
      : new Set<number>();

    const weeks: Array<{
      label: string;
      month: string;
      entries: Array<{ date: string; dayShort: string; school: string; courseType: string; time: string; address?: string; confirmationSummary?: string }>;
    }> = [];
    type ScheduleEntryRow = {
      date: string;
      dayShort: string;
      school: string;
      courseType: string;
      time: string;
      address?: string;
      confirmationSummary?: string;
      sortKey: number;
    };

    for (const month of displayMonthIndexes) {
      const monthStart = new Date(targetYear, month, 1);
      const monthEnd = new Date(targetYear, month + 1, 0, 23, 59, 59, 999);
      const entries = [
        ...actualRows
          .filter((a) => a.date >= monthStart && a.date <= monthEnd)
          .map((a): ScheduleEntryRow => {
            const iso = a.date.toISOString().slice(0, 10);
            const weekday = weekdayOfIso(iso);
            return {
              date: formatMonthDay(iso),
              dayShort: weekday.replace("星期", ""),
              school: a.scheduledSchoolName?.trim() || a.course.school,
              courseType: a.course.courseType,
              time: effectiveAttendanceTime({
                scheduledTime: actualTimeMap.get(a.id),
                courseTime: a.course.time,
                attendanceHours: a.hours,
                isPayrollLocked: a.isPayrollLocked,
                reportContent: a.reportContent,
                reportSentAt: a.reportSentAt,
                studentCount: a.studentCount,
                studentCountA: a.studentCountA,
                studentCountB: a.studentCountB,
              }),
              address: a.scheduledAddress?.trim() || a.course.address || a.course.schoolRel?.address || "",
              confirmationSummary: confirmationSummaryFor(a.scheduledSchoolId ?? a.course.schoolId),
              sortKey: a.date.getTime(),
            };
          }),
        ...displayCourses
          .filter((c) => !datedCourseIds.has(c.id))
          .filter((c: { dayOfWeek: string }) => DAY_JS[c.dayOfWeek] !== undefined)
          .flatMap((c: { dayOfWeek: string; schoolId?: number | null; school: string; courseType: string; time: string; address?: string; schoolRel?: { address?: string } | null }) => {
            const rows: ScheduleEntryRow[] = [];
            const targetDay = DAY_JS[c.dayOfWeek];
            const cursor = new Date(monthStart);
            while (cursor <= monthEnd) {
              if (cursor.getDay() === targetDay) {
                rows.push({
                  date: fmt(cursor),
                  dayShort: c.dayOfWeek.replace("星期", ""),
                  school: c.school,
                  courseType: c.courseType,
                  time: c.time,
                  address: c.address || c.schoolRel?.address || "",
                  confirmationSummary: confirmationSummaryFor(c.schoolId),
                  sortKey: cursor.getTime(),
                });
              }
              cursor.setDate(cursor.getDate() + 1);
            }
            return rows;
          }),
      ];

      weeks.push({
        label: `${targetYear} 年 ${month + 1} 月`,
        month: `${month + 1}月`,
        entries: entries
          .sort((a, b) => a.sortKey - b.sortKey)
          .map(({ date, dayShort, school, courseType, time, address, confirmationSummary }) => ({ date, dayShort, school, courseType, time, address, confirmationSummary })),
      });
    }

    const msg = buildTwoMonthScheduleMessage({ teacherName: teacher.name, weeks });
    await replyMessage(replyToken, [msg], token);
    return;
  }

  // Fallback: legacy "幼兒園 16" / "安親 8" text-based count (kept for manual entry)
  const countMatch = text.match(/^(幼兒園|國小|安親)\s+(\d+)$/);
  if (countMatch) {
    const dept = countMatch[1];
    const count = parseInt(countMatch[2]);
    try {
      const teacher = await prisma.teacher.findFirst({ where: { lineUserId: userId } } as never) as { id: number; name: string } | null;
      if (!teacher) {
        await replyMessage(replyToken, [{ type: "text", text: "找不到您的老師資料，請先完成綁定。" }], token);
        return;
      }
      const today = new Date();
      const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const end = new Date(start.getTime() + 86400000);
      const att = await prisma.attendance.findFirst({
        where: { actualTeacherId: teacher.id, date: { gte: start, lt: end }, cancelled: false },
        orderBy: { id: "desc" },
      });
      if (att) {
        await prisma.attendance.update({ where: { id: att.id }, data: { studentCount: count } });
        await replyMessage(replyToken, [{ type: "text", text: `✅ 已記錄 ${dept} 出席 ${count} 人！` }], token);
      } else {
        await replyMessage(replyToken, [{ type: "text", text: "找不到今日課程紀錄，請管理員先建立出勤紀錄。" }], token);
      }
    } catch (e) {
      console.error("studentCount error:", e);
      await replyMessage(replyToken, [{ type: "text", text: "儲存出席人數時發生錯誤，請稍後再試。" }], token);
    }
    return;
  }

  const upper = text.toUpperCase();
  const looksLikeBindCode = /^[A-Z0-9]{6}$/.test(upper);

  if (isSchoolLineRegion(region)) {
    if (looksLikeBindCode) {
      await ensureSchoolLineRegionColumn();
      const school = await prisma.school.findFirst({ where: { lineBindCode: upper } });
      if (school) {
        await prisma.$executeRawUnsafe(
          "UPDATE School SET lineUserId = ?, lineRegion = ? WHERE id = ?",
          userId,
          region,
          school.id,
        );
        await replyMessage(replyToken, [{ type: "text", text: `✅ 綁定成功！${school.name} 已連結。之後課程回報會自動發送到這裡。` }], token);
        return;
      }
      await replyMessage(replyToken, [{ type: "text", text: "找不到此綁定碼，請確認後重試，或聯絡管理員。" }], token);
      return;
    }
    return;
  }

  if (looksLikeBindCode) {
    const teacher = await prisma.teacher.findFirst({ where: { lineBindCode: upper } });
    if (teacher) {
      await prisma.teacher.update({ where: { id: teacher.id }, data: { lineUserId: userId, lineRegion: region } });
      await replyMessage(replyToken, [{ type: "text", text: `✅ 綁定成功！${teacher.name} 老師，您已連結到${region === "north" ? "北部" : "南部"}系統。` }], token);
      return;
    }
    await replyMessage(replyToken, [{ type: "text", text: "請確認綁定碼是否正確，或聯絡管理員。" }], token);
    return;
  }

  // Ignore casual chat such as "ok" or "感謝". Teachers only receive replies
  // after explicit commands like "課表" / "報課" or while completing a report.
}

async function handlePostback(userId: string, data: string, replyToken: string, region: LineRegion, token: string) {
  const params = new URLSearchParams(data);
  const action = params.get("action");
  const attendanceId = Number(params.get("id"));

  if (action === "leave_select") {
    const teacher = await prisma.teacher.findFirst({ where: { lineUserId: userId } } as never) as { id: number; name: string } | null;
    if (!teacher) {
      await replyMessage(replyToken, [{ type: "text", text: "找不到您的老師資料，請先完成綁定。" }], token);
      return;
    }
    const leaveCount = await semesterLeaveCount(teacher.id);
    pendingLeaveApplications.set(userId, attendanceId);
    await replyMessage(replyToken, [{
      type: "text",
      text: `請輸入請假原因（必填）。\n\n提醒：您本學期已請假 ${leaveCount} 次，本次送出後將累計為 ${leaveCount + 1} 次。`,
    }], token);
    return;
  }

  if (action === "leave_cancel") {
    const teacher = await prisma.teacher.findFirst({ where: { lineUserId: userId } } as never) as { id: number; name: string } | null;
    if (!teacher) {
      await replyMessage(replyToken, [{ type: "text", text: "找不到您的老師資料，請先完成綁定。" }], token);
      return;
    }
    try {
      const result = await cancelLeaveRequestByTeacher({ leaveRequestId: attendanceId, teacherId: teacher.id });
      await replyMessage(replyToken, [{
        type: "text",
        text: result.alreadyCancelled
          ? "這筆請假申請已經是取消狀態。"
          : `✅ 已取消請假申請。\n\n${result.leave.leaveDate} ${result.leave.time}\n${result.leave.school}｜${result.leave.courseType}`,
      }], token);
    } catch (error) {
      await replyMessage(replyToken, [{ type: "text", text: (error as Error).message || "取消請假失敗，請稍後再試。" }], token);
    }
    return;
  }

  if (action === "sub_available" || action === "sub_unavailable" || action === "sub_cancel") {
    const inquiryId = Number(params.get("inquiryId"));
    const inquiry = Number.isFinite(inquiryId) ? await getInquiryWithLeave(inquiryId) : null;
    if (!inquiry) {
      await replyMessage(replyToken, [{ type: "text", text: "找不到這筆代課詢問，請聯絡行政確認。" }], token);
      return;
    }
    if (inquiry.candidateLineUserId && inquiry.candidateLineUserId !== userId) {
      await replyMessage(replyToken, [{ type: "text", text: "這筆代課詢問不是發送給您的，請聯絡行政確認。" }], token);
      return;
    }
    const leaveStatus = (inquiry as typeof inquiry & { leaveStatus?: string }).leaveStatus;
    // M22：代課老師按「取消代課」→ 立即通知行政並開異常單（已確認代課後取消 = P1 可能開天窗）
    if (action === "sub_cancel") {
      const afterConfirmed = leaveStatus === LEAVE_STATUS.found;
      const detail = `${String(inquiry.leaveDate).slice(0, 10)} ${inquiry.startTime}-${inquiry.endTime}｜${inquiry.school}｜${inquiry.courseType}（原請假老師：${inquiry.teacherName}）`;
      await raiseSystemAlert({
        level: afterConfirmed ? "P1" : "P2",
        category: "代課取消",
        title: afterConfirmed
          ? `${inquiry.candidateTeacherName} 老師取消代課（該課已確認代課，可能開天窗，請立即處理）`
          : `${inquiry.candidateTeacherName} 老師取消先前的代課回覆`,
        detail,
        dedupeKey: `sub-cancel:${inquiryId}:${Date.now()}`,
      }).catch((error) => console.error("raiseSystemAlert failed:", error));
      if (!afterConfirmed) {
        // 未確認前的取消不推 P1，但仍即時通知行政知悉
        await pushAdminAlert(`ℹ️【代課取消】${inquiry.candidateTeacherName} 老師取消先前的代課回覆\n${detail}`).catch(() => undefined);
      }
    }
    if (leaveStatus === LEAVE_STATUS.found
      || inquiry.status === INQUIRY_STATUS.noLongerNeeded
      || inquiry.status === INQUIRY_STATUS.expired) {
      await replyMessage(replyToken, [{
        type: "text",
        text: action === "sub_cancel"
          ? "已收到您的取消通知，行政已同步收到提醒，將盡快與您聯絡確認。"
          : "這堂課目前已找到代課老師，謝謝您的回覆與協助。",
      }], token);
      return;
    }
    const nextStatus = action === "sub_available"
      ? INQUIRY_STATUS.available
      : action === "sub_cancel"
        ? INQUIRY_STATUS.cancelled
        : INQUIRY_STATUS.unavailable;
    await updateInquiryResponse(inquiryId, nextStatus);
    await replyMessage(replyToken, [{
      type: "text",
      text: action === "sub_available"
        ? "已收到您的回覆，行政確認後會再通知您是否安排代課。"
        : action === "sub_cancel"
          ? "已收到您的取消代課回覆。若此代課已由行政確認，請等待行政重新處理；正式代課不會自動取消。"
        : "已收到您的回覆，謝謝您回覆。",
    }], token);
    return;
  }

  if (action === "course_change_available" || action === "course_change_unavailable" || action === "course_change_discuss") {
    const requestId = Number(params.get("requestId"));
    const teacher = await prisma.teacher.findFirst({
      where: { lineUserId: userId },
      select: { id: true, name: true },
    });
    if (!teacher) {
      await replyMessage(replyToken, [{ type: "text", text: "找不到您的老師資料，請先完成綁定。" }], token);
      return;
    }
    try {
      const response = action === "course_change_available"
        ? "AVAILABLE"
        : action === "course_change_unavailable"
          ? "UNAVAILABLE"
          : "DISCUSS";
      const updated = await respondToCourseChange(requestId, teacher.id, response, teacher.name);
      await writeAuditLog(null, {
        action: "line_update_status",
        targetType: "CourseChangeRequest",
        targetId: requestId,
        targetLabel: `${updated?.originalSchoolName ?? ""} ${updated?.course.courseType ?? ""}`,
        actorUserId: teacher.id,
        actorName: teacher.name,
        actorRole: "teacher",
        afterData: { status: updated?.status, teacherResponse: response },
        diffSummary: `${teacher.name} 回覆課程異動：${response}`,
        sensitive: true,
      });
      const replyText = response === "AVAILABLE"
        ? "已收到您的回覆，行政確認完成後會更新正式課表，謝謝老師。"
        : response === "UNAVAILABLE"
          ? "已收到您的回覆，我們會再協助安排，謝謝老師。"
          : "已收到您的回覆，行政會再與您聯繫確認。";
      await replyMessage(replyToken, [{ type: "text", text: replyText }], token);
    } catch (error) {
      await replyMessage(replyToken, [{ type: "text", text: (error as Error).message || "課程異動回覆失敗，請聯絡行政確認。" }], token);
    }
    return;
  }

  if (action === "equipment_flow_accept" || action === "equipment_flow_delivered" || action === "equipment_flow_cannot") {
    const teacher = await prisma.teacher.findFirst({
      where: { lineUserId: userId },
      select: { id: true, name: true },
    });
    if (!teacher) {
      await replyMessage(replyToken, [{ type: "text", text: "找不到您的老師資料，請先完成綁定。" }], token);
      return;
    }
    const flow = await getEquipmentFlow(attendanceId);
    if (!flow || !flow.isActive) {
      await replyMessage(replyToken, [{ type: "text", text: "找不到這筆器材詢問，請聯絡行政確認。" }], token);
      return;
    }
    if (flow.responsibleTeacherId && flow.responsibleTeacherId !== teacher.id) {
      await replyMessage(replyToken, [{ type: "text", text: "這筆器材詢問不是發送給您的，請聯絡行政確認。" }], token);
      return;
    }
    const statusByAction: Record<string, string> = {
      equipment_flow_accept: "已接受",
      equipment_flow_delivered: "已送達",
      equipment_flow_cannot: "無法協助",
    };
    const updated = await updateEquipmentFlowStatus(flow.id, statusByAction[action], teacher.name);
    await writeAuditLog(null, {
      action: "line_update_status",
      targetType: "EquipmentFlow",
      targetId: flow.id,
      targetLabel: flow.equipmentName,
      actorUserId: teacher.id,
      actorName: teacher.name,
      actorRole: "teacher",
      beforeData: { status: flow.status },
      afterData: { status: updated?.status },
      diffSummary: diffSummary({ status: flow.status }, { status: updated?.status }, { status: "狀態" }),
    });
    if (action === "equipment_flow_accept") {
      await replyMessage(replyToken, [buildEquipmentFlowAcceptedMessage({
        flowId: flow.id,
        nextSchoolName: flow.nextSchoolName,
        nextAddress: flow.nextAddress,
      })], token);
    } else {
      const replyByAction: Record<string, string> = {
        equipment_flow_delivered: "已記錄：器材已送達。謝謝您的協助！",
        equipment_flow_cannot: "已收到無法協助的回覆，行政會另外安排，謝謝老師。",
      };
      await replyMessage(replyToken, [{ type: "text", text: replyByAction[action] }], token);
    }
    return;
  }

  // 器材確認按鈕：已確認器材 / 已完成組裝 / 已完成轉送 / 無法協助
  if (action === "equipment_confirm" || action === "equipment_assembled" || action === "equipment_transferred" || action === "equipment_cannot_help") {
    if (!(await ensureTeacherCanAccessAttendance(userId, attendanceId, replyToken, token))) return;
    const statusByAction: Record<string, EquipmentStatus> = {
      equipment_confirm: "已確認器材",
      equipment_assembled: "已完成組裝",
      equipment_transferred: "已完成轉送",
      equipment_cannot_help: "無法協助",
    };
    const row = await setEquipmentStatus(attendanceId, statusByAction[action]);
    if (!row) {
      await replyMessage(replyToken, [{ type: "text", text: "這堂課目前沒有器材提醒設定，若有疑問請聯絡行政。" }], token);
      return;
    }
    const replyByAction: Record<string, string> = {
      equipment_confirm: "✅ 已記錄：器材已確認。謝謝您的協助！",
      equipment_assembled: "✅ 已記錄：器材已完成組裝。謝謝您的協助！",
      equipment_transferred: `✅ 已記錄：器材已完成轉送。謝謝您的協助！${equipmentNextStopLabel(row) ? `\n下一站：${equipmentNextStopLabel(row)}` : ""}`,
      equipment_cannot_help: "已收到您的回覆，行政會另行安排器材事宜，謝謝告知。",
    };
    await replyMessage(replyToken, [{ type: "text", text: replyByAction[action] }], token);
    return;
  }

  if (action === "select_progress") {
    if (!(await ensureTeacherCanSubmitReport(userId, attendanceId, replyToken, token))) return;
    const attForCurriculum = await prisma.attendance.findUnique({
      where: { id: attendanceId },
      include: { course: true },
    }) as unknown as { course: { courseType: string } } | null;
    const courseType = attForCurriculum?.course?.courseType ?? "";
    const curriculum = await prisma.courseProgress.findMany({
      where: { courseType: courseLabel(courseType) },
      orderBy: { lesson: "asc" },
    }) as Array<{ lesson: number; title: string }>;
    await replyMessage(replyToken, [buildCurriculumSelectMessage(attendanceId, courseType, curriculum)], token);
    return;
  }

  if (action === "report_progress") {
    if (!(await ensureTeacherCanSubmitReport(userId, attendanceId, replyToken, token))) return;
    const content = decodeURIComponent(params.get("content") ?? "");
    await prisma.attendance.update({
      where: { id: attendanceId },
      data: { reportContent: content, reportSentAt: new Date() },
    });
    const attInfo = await prisma.attendance.findUnique({
      where: { id: attendanceId }, include: { course: true },
    }) as unknown as { category: string; course: { department: string } } | null;
    const dept = attInfo?.course?.department ?? "幼兒園";
    await completeOrAskCount(attendanceId, attInfo?.category, dept, replyToken, token, `✅ 已記錄：【${content}】`);
    return;
  }

  // Handle count board submission via postback
  if (action === "report_count") {
    const group = params.get("group") ?? "";
    const count = Number(params.get("count"));
    await handleCountSubmit(userId, attendanceId, group, count, replyToken, token);
    return;
  }

  if (action === "report") {
    if (!(await ensureTeacherCanSubmitReport(userId, attendanceId, replyToken, token))) return;
    const status = params.get("status");
    const cancelled = status === "cancelled";
    await prisma.attendance.update({
      where: { id: attendanceId },
      data: { cancelled, reportContent: cancelled ? "停課" : "正常上課", reportSentAt: new Date() },
    });

    if (!cancelled) {
      const attInfo = await prisma.attendance.findUnique({
        where: { id: attendanceId }, include: { course: true },
      }) as unknown as { category: string; course: { department: string } } | null;
      const dept = attInfo?.course?.department ?? "幼兒園";
      await completeOrAskCount(attendanceId, attInfo?.category, dept, replyToken, token, "✅ 已記錄正常上課！");
    } else {
      await replyMessage(replyToken, [{ type: "text", text: "已記錄停課，謝謝回報！" }], token);
    }
    return;
  }

  if (action === "report_detail") {
    if (!(await ensureTeacherCanSubmitReport(userId, attendanceId, replyToken, token))) return;
    pendingDetails.set(userId, attendanceId);
    await replyMessage(replyToken, [{
      type: "text",
      text: "請輸入今日課程內容（例如：蛙跳核心訓練及平衡感訓練）：",
    }], token);
    return;
  }
}

async function completeOrAskCount(
  attendanceId: number,
  category: string | null | undefined,
  dept: string,
  replyToken: string,
  token: string,
  prefixText: string,
) {
  if (!requiresStudentCount(category)) {
    await replyMessage(replyToken, [{ type: "text", text: `${prefixText}\n課內課固定班級，免填出席人數，已完成回報。` }], token);
    await forwardReportToSchool(attendanceId);
    return;
  }
  await sendCountBoard(attendanceId, dept, replyToken, token, `${prefixText}\n請填寫今日出席人數：`);
  await forwardReportToSchool(attendanceId);
}

// Decide whether to show A班 board (安親) or single board (幼兒園/國小)
async function sendCountBoard(
  attendanceId: number,
  dept: string,
  replyToken: string,
  token: string,
  prefixText: string,
) {
  const isAnqin = dept.includes("安親");
  if (isAnqin) {
    await replyMessage(replyToken, [
      { type: "text", text: `${prefixText}\n安親班需分別填寫 A班 與 B班 人數：` },
      buildStudentCountBoard(attendanceId, "A", dept),
    ], token);
  } else {
    const max = dept.includes("幼兒園") ? 25 : 40;
    await replyMessage(replyToken, [
      { type: "text", text: prefixText },
      buildStudentCountBoard(attendanceId, "", dept, 1, max),
    ], token);
  }
}

// Handle count board postback
async function handleCountSubmit(
  userId: string,
  attendanceId: number,
  group: string,
  count: number,
  replyToken: string,
  token: string,
) {
  if (!(await ensureTeacherCanSubmitReport(userId, attendanceId, replyToken, token))) return;
  if (group === "A") {
    // Save A班 count, show B班 board
    await prisma.attendance.update({
      where: { id: attendanceId },
      data: { studentCountA: count } as never,
    });
    pendingGroupB.set(userId, attendanceId);
    await replyMessage(replyToken, [
      { type: "text", text: `✅ A班 已記錄 ${count} 人，請繼續填寫 B班 人數：` },
      buildStudentCountBoard(attendanceId, "B", "安親", 1, 40),
    ], token);
    return;
  }

  if (group === "B") {
    pendingGroupB.delete(userId);
    // Save B班 count, compute total
    const attA = await prisma.attendance.findUnique({ where: { id: attendanceId } }) as unknown as { studentCountA: number | null } | null;
    const countA = attA?.studentCountA ?? 0;
    const total = countA + count;
    await prisma.attendance.update({
      where: { id: attendanceId },
      data: { studentCountB: count, studentCount: total } as never,
    });
    await replyMessage(replyToken, [{
      type: "text",
      text: `✅ 出席人數已記錄！\nA班：${countA} 人 ＋ B班：${count} 人 ＝ 合計 ${total} 人`,
    }], token);
    await forwardReportToSchool(attendanceId);
    return;
  }

  // Single class (幼兒園 / 國小)
  await prisma.attendance.update({
    where: { id: attendanceId },
    data: { studentCount: count },
  });
  const attInfo = await prisma.attendance.findUnique({
    where: { id: attendanceId }, include: { course: true },
  }) as unknown as { course: { department: string } } | null;
  const dept = attInfo?.course?.department ?? "幼兒園";
  await replyMessage(replyToken, [{ type: "text", text: `✅ ${dept} 出席 ${count} 人，已記錄！` }], token);
  await forwardReportToSchool(attendanceId);
}

async function saveDetailedReport(userId: string, attendanceId: number, text: string, replyToken: string, token: string, region: LineRegion) {
  void region;
  if (!(await ensureTeacherCanSubmitReport(userId, attendanceId, replyToken, token))) return;
  const content = text.replace(/^自訂[：:]\s*/, "").trim() || "";

  await prisma.attendance.update({
    where: { id: attendanceId },
    data: { reportContent: content, reportSentAt: new Date() },
  });

  const att = await prisma.attendance.findUnique({
    where: { id: attendanceId },
    include: { course: true },
  }) as unknown as { category: string; course: { department: string } } | null;

  const dept = att?.course?.department ?? "幼兒園";
  await completeOrAskCount(attendanceId, att?.category, dept, replyToken, token, `✅ 成功記錄：【${content}】`);
}

async function forwardReportToSchool(attendanceId: number) {
  await notifySchoolReport(attendanceId);
}

export { generateBindCode };
