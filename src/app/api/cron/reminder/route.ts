import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLineConfig, pushMessage, buildReminderMessages } from "@/lib/line";
import type { LineRegion } from "@/lib/line";
import { courseDateWindowWhere, courseIdsWithAnyAttendance, dayBounds, dayNameOfIso } from "@/lib/scheduleLogic";
import { attendanceScheduledTimeMap, effectiveAttendanceTime, stampAttendanceTime } from "@/lib/attendanceTime";
import { createAttendancesForUniqueDays } from "@/lib/attendanceBatch";
import { attendanceHoursFromCourseTime } from "@/lib/courseHours";
import { taipeiDateIso } from "@/lib/courseDates";
import { courseConfirmationMapBySchoolIds, courseConfirmationSummary } from "@/lib/courseConfirmation";
import { equipmentByAttendanceIds } from "@/lib/equipmentReminder";
import { expectedStudentCountMap } from "@/lib/expectedStudentCount";
import type { EquipmentReminderData } from "@/lib/equipmentReminderCore";
import { recordAutomationRun } from "@/lib/automationHealth";
import { previousLessonRecapMap, type LessonRecap } from "@/lib/lessonHandoff";
import { upcomingLessonMap, type UpcomingLesson } from "@/lib/lessonProgress";

type ReminderTeacher = { id: number; name: string; lineUserId: string | null; lineRegion: string };
type ReminderCourse = { attendanceId?: number; courseId?: number; school: string; time: string; courseType: string; address?: string; date: string; dayOfWeek: string; confirmationSummary?: string; equipment?: EquipmentReminderData | null; studentCount?: number | null; studentCountA?: number | null; studentCountB?: number | null; expectedStudentCount?: number | null; reportRole?: "lead" | "assistant"; lessonProgress?: UpcomingLesson | null; recap?: ReminderRecap | null };
type ReminderRecap = { date: string; teacherName: string; progress: string; handoffNote: string; incidentSummary: string; studentCount: number | null };

function addIsoDays(iso: string, days: number) {
  const date = new Date(`${iso}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function ensureCourseReminderDeliveryTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS CourseReminderDelivery (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      teacherId INTEGER NOT NULL,
      targetDate TEXT NOT NULL,
      dayOffset INTEGER NOT NULL DEFAULT 0,
      sentAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(teacherId, targetDate, dayOffset)
    )
  `);
  // 舊資料只記「這位老師這天發過了」，不記發了什麼；補上內容指紋後，
  // 排程跑完才新增的課才有辦法被判定為「內容變了，要補發」。
  await prisma
    .$executeRawUnsafe("ALTER TABLE CourseReminderDelivery ADD COLUMN contentHash TEXT")
    .catch(() => undefined);
}

/**
 * 課表指紋：只取「老師會在乎的異動」——多一堂課、換園所、改時間、改課別。
 * 器材／預計人數這類附掛資訊變動不重發，免得老師被同一天的提醒洗版。
 */
function reminderContentHash(courses: ReminderCourse[]) {
  const fingerprint = courses
    .map((course) => [course.courseId ?? 0, course.school, course.time, course.courseType].join("|"))
    .sort()
    .join(";");
  return createHash("sha1").update(fingerprint).digest("hex");
}

type DeliveryState = "new" | "changed" | "same";

async function courseReminderState(
  teacherId: number,
  targetDate: string,
  contentHash: string,
): Promise<DeliveryState> {
  // 故意不篩 dayOffset：老師只在乎「這堂課有沒有被通知過」，不在乎是前一天還是當天發的。
  // 只鎖 (teacherId, targetDate) 才能擋掉「前一天自動發過 + 有人又手動點今日提醒」這種同一堂課發兩次。
  const rows = await prisma.$queryRawUnsafe<Array<{ contentHash: string | null }>>(
    "SELECT contentHash FROM CourseReminderDelivery WHERE teacherId = ? AND targetDate = ? ORDER BY sentAt DESC LIMIT 1",
    teacherId,
    targetDate,
  );
  if (rows.length === 0) return "new";
  const stored = rows[0]?.contentHash;
  // 加欄位之前寫入的舊列沒有指紋，無從比對；當作已發送，避免升級當下對全體老師重發。
  if (!stored) return "same";
  return stored === contentHash ? "same" : "changed";
}

async function markCourseReminderSent(teacherId: number, targetDate: string, dayOffset: number, contentHash: string) {
  await prisma.$executeRawUnsafe(
    `INSERT INTO CourseReminderDelivery (teacherId, targetDate, dayOffset, contentHash)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(teacherId, targetDate, dayOffset)
     DO UPDATE SET contentHash = excluded.contentHash, sentAt = CURRENT_TIMESTAMP`,
    teacherId,
    targetDate,
    dayOffset,
    contentHash,
  );
}

export async function GET(req: NextRequest) {
  // 資安：secret 只接受 Authorization header，不接受 querystring（會留在 log / 瀏覽器歷史）
  const authHeader = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await ensureCourseReminderDeliveryTable();

  const dayOffsetRaw = Number(req.nextUrl.searchParams.get("dayOffset") ?? "0");
  const dayOffset = Number.isFinite(dayOffsetRaw) ? Math.max(0, Math.min(1, dayOffsetRaw)) : 0;
  const targetIso = addIsoDays(taipeiDateIso(), dayOffset);
  const targetDate = new Date(`${targetIso}T00:00:00.000Z`);
  const targetName = dayNameOfIso(targetIso);
  const { start: dayStart, end: dayEnd } = dayBounds(targetIso);
  const targetCourseWindow = courseDateWindowWhere(targetIso);
  const datedCourseIds = await courseIdsWithAnyAttendance({ isActive: true, ...targetCourseWindow }, targetDate);

  const [bySchedule, byWeekday] = await Promise.all([
    prisma.attendance.findMany({
      where: {
        cancelled: false,
        date: { gte: dayStart, lt: dayEnd },
        // 封存課程會保留既有出勤供歷史、薪資與請款查詢，但不能再進入每日提醒。
        // 否則同一門課重建後，舊課與新課會各產生一張幾乎相同的 LINE 卡片。
        course: { isActive: true },
      },
      include: { course: { include: { schoolRel: true } }, actualTeacher: true, assistantTeacher: true },
    }),
    prisma.course.findMany({
      where: {
        isActive: true,
        ...targetCourseWindow,
        dayOfWeek: targetName,
        ...(datedCourseIds.size > 0 ? { id: { notIn: [...datedCourseIds] } } : {}),
      },
      include: { teacher: true, assistantTeacher: true, schoolRel: true },
    }),
  ]);
  const scheduledTimeMap = await attendanceScheduledTimeMap(bySchedule.map((attendance) => attendance.id));
  const confirmationMap = await courseConfirmationMapBySchoolIds([
    ...bySchedule.map((att) => att.course.schoolId ?? 0),
    ...byWeekday.map((course) => course.schoolId ?? 0),
  ]);
  const confirmationSummaryFor = (schoolId?: number | null) => schoolId
    ? courseConfirmationSummary(confirmationMap.get(schoolId), { multiline: true, teacher: true })
    : "";
  const weekdayWithAttendance = await Promise.all(byWeekday.map(async (course) => {
    const calculated = attendanceHoursFromCourseTime(course.time || "");
    const result = await createAttendancesForUniqueDays([targetIso], {
      courseId: course.id, actualTeacherId: course.teacherId, assistantTeacherId: course.assistantTeacherId,
      category: course.category, hours: calculated.hours,
      notes: calculated.needsReview ? `上課時間需人工確認：${calculated.reason}` : "",
    });
    const attendance = result.records[0] ?? await prisma.attendance.findFirst({ where: { courseId: course.id, date: { gte: dayStart, lt: dayEnd } } });
    await stampAttendanceTime(course.id, [targetIso], course.time || "").catch(() => undefined);
    return { ...course, attendanceId: attendance?.id, attStudentCount: attendance?.studentCount ?? null, attStudentCountA: attendance?.studentCountA ?? null, attStudentCountB: attendance?.studentCountB ?? null };
  }));

  const courses = [
    ...bySchedule.map((att) => ({
      attendanceId: att.id,
      courseId: att.courseId,
      school: att.course.school,
      address: att.course.address || att.course.schoolRel?.address || "",
      time: effectiveAttendanceTime({
        scheduledTime: scheduledTimeMap.get(att.id),
        courseTime: att.course.time,
        attendanceHours: att.hours,
        isPayrollLocked: att.isPayrollLocked,
        reportContent: att.reportContent,
        reportSentAt: att.reportSentAt,
        studentCount: att.studentCount,
        studentCountA: att.studentCountA,
        studentCountB: att.studentCountB,
      }),
      courseType: att.course.courseType,
      confirmationSummary: confirmationSummaryFor(att.course.schoolId),
      studentCount: att.studentCount,
      studentCountA: att.studentCountA,
      studentCountB: att.studentCountB,
      recipients: [
        { teacher: att.actualTeacher, reportRole: "lead" as const },
        ...(att.assistantTeacher && att.assistantTeacher.id !== att.actualTeacher.id
          ? [{ teacher: att.assistantTeacher, reportRole: "assistant" as const }]
          : []),
      ],
    })),
    ...weekdayWithAttendance.map((course) => ({
      attendanceId: course.attendanceId,
      courseId: course.id,
      school: course.school,
      address: course.address || course.schoolRel?.address || "",
      time: course.time,
      courseType: course.courseType,
      confirmationSummary: confirmationSummaryFor(course.schoolId),
      studentCount: course.attStudentCount,
      studentCountA: course.attStudentCountA,
      studentCountB: course.attStudentCountB,
      recipients: [
        { teacher: course.teacher, reportRole: "lead" as const },
        ...(course.assistantTeacher && course.assistantTeacher.id !== course.teacher.id
          ? [{ teacher: course.assistantTeacher, reportRole: "assistant" as const }]
          : []),
      ],
    })),
  ];

  if (courses.length === 0) {
    await recordAutomationRun({
      jobKey: `teacher-reminder:${dayOffset}`,
      targetDate: targetIso,
      status: "success",
      total: 0,
      success: 0,
      failed: 0,
      details: "當日沒有課程",
    }).catch(() => undefined);
    return NextResponse.json({ sent: 0, message: "no courses today" });
  }

  // 器材提醒 + 預計人數：一次撈出所有出勤的設定，附掛到提醒卡片
  // 上一堂回顧：同課程最近一堂已回報的進度與交接提醒，接在提醒後面推給接手的老師
  const [equipmentMap, expectedMap, recapMap, lessonMap] = await Promise.all([
    equipmentByAttendanceIds(courses.map((course) => course.attendanceId ?? 0)),
    expectedStudentCountMap(courses.map((course) => course.attendanceId ?? 0)),
    previousLessonRecapMap(courses.map((course) => course.courseId ?? 0), targetIso).catch(() => new Map<number, LessonRecap>()),
    // 這堂是第幾堂、上什麼：課綱或回報有缺就靜靜略過，不擋提醒發送
    upcomingLessonMap(
      courses.map((course) => ({ id: course.courseId ?? 0, courseType: course.courseType })),
      targetIso,
    ).catch(() => new Map<number, UpcomingLesson>()),
  ]);

  // 上一堂回顧改成塞進提醒卡的欄位；課堂摘要偏長，卡片上只留進度／人數／事件／交接
  const recapFor = (courseId: number): ReminderRecap | null => {
    const recap = recapMap.get(courseId);
    if (!recap) return null;
    if (!recap.progress && !recap.handoffNote && !recap.incidentSummary && recap.studentCount == null) return null;
    return {
      date: recap.date,
      teacherName: recap.teacherName,
      progress: recap.progress,
      handoffNote: recap.handoffNote,
      incidentSummary: recap.incidentSummary,
      studentCount: recap.studentCount,
    };
  };

  const byTeacher = new Map<number, { teacher: ReminderTeacher; courses: ReminderCourse[] }>();
  for (const course of courses) {
    for (const { teacher, reportRole } of course.recipients) {
      const item = byTeacher.get(teacher.id) ?? { teacher, courses: [] };
      item.courses.push({
        attendanceId: course.attendanceId,
        courseId: course.courseId,
        school: course.school,
        address: course.address,
        time: course.time,
        courseType: course.courseType,
        date: targetIso,
        dayOfWeek: targetName,
        confirmationSummary: course.confirmationSummary,
        equipment: course.attendanceId ? equipmentMap.get(course.attendanceId) ?? null : null,
        expectedStudentCount: course.attendanceId ? expectedMap.get(course.attendanceId) ?? null : null,
        lessonProgress: course.courseId ? lessonMap.get(course.courseId) ?? null : null,
        recap: course.courseId ? recapFor(course.courseId) : null,
        reportRole,
      });
      byTeacher.set(teacher.id, item);
    }
  }

  let sent = 0;
  let resent = 0;
  let skippedNoLine = 0;
  let skippedAlreadySent = 0;
  const errors: string[] = [];

  // 指定老師補發：只鎖定這一位，並略過去重（人工按下去就是明知故犯地要重發）
  const onlyTeacherIdRaw = Number(req.nextUrl.searchParams.get("teacherId") ?? "");
  const onlyTeacherId = Number.isInteger(onlyTeacherIdRaw) && onlyTeacherIdRaw > 0 ? onlyTeacherIdRaw : null;

  const queue = onlyTeacherId
    ? [...byTeacher.values()].filter((item) => item.teacher.id === onlyTeacherId)
    : [...byTeacher.values()];

  for (const { teacher, courses: teacherCourses } of queue) {
    if (!teacher.lineUserId) {
      skippedNoLine++;
      continue;
    }
    const contentHash = reminderContentHash(teacherCourses);
    const state = onlyTeacherId ? "changed" : await courseReminderState(teacher.id, targetIso, contentHash);
    if (state === "same") {
      skippedAlreadySent++;
      continue;
    }

    const region = (teacher.lineRegion || "north") as LineRegion;
    const token = getLineConfig(region).token;

    const baseTitle = dayOffset === 1 ? "明日課程提醒" : "今日課程提醒";
    const messages = buildReminderMessages({
      teacherName: teacher.name,
      // 第二次以後才送的，標題講清楚原因，老師才不會以為系統重複發同一則
      title: state === "changed" ? `${baseTitle}（課表有更新）` : baseTitle,
      date: targetIso,
      dayOfWeek: targetName,
      courses: teacherCourses,
    });

    try {
      // 回顧已併進提醒卡；一堂課一則、最多兩則（三堂以上其餘收進第二則）
      await pushMessage(teacher.lineUserId, messages, token);
      await markCourseReminderSent(teacher.id, targetIso, dayOffset, contentHash);
      sent++;
      if (state === "changed") resent++;
    } catch (e) {
      errors.push(`${teacher.name}: ${e}`);
    }
  }

  // 指定老師補發是人工單點操作，不該覆蓋當天整批排程的健康狀態
  if (!onlyTeacherId) {
    await recordAutomationRun({
      jobKey: `teacher-reminder:${dayOffset}`,
      targetDate: targetIso,
      status: errors.length ? (sent || skippedAlreadySent ? "partial" : "failed") : "success",
      total: byTeacher.size,
      success: sent + skippedAlreadySent,
      failed: errors.length,
      details: errors.join("\n"),
    }).catch(() => undefined);
  }

  return NextResponse.json({
    ok: errors.length === 0,
    sent,
    resent,
    total: queue.length,
    checked: courses.length,
    skippedNoLine,
    skippedAlreadySent,
    dayOffset,
    targetDate: targetIso,
    teacherId: onlyTeacherId,
    errors,
  });
}
