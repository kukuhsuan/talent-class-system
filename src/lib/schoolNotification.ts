import { prisma } from "@/lib/prisma";
import { expectedStudentCountMap } from "@/lib/expectedStudentCount";
import { buildSchoolReportMessage, buildUpbearSchoolReportMessage, getLineConfig, pushMessage } from "@/lib/line";
import type { LineRegion } from "@/lib/line";
import { getOrCreatePortalCode } from "@/lib/schoolPortalAccess";
import { taipeiDateIso } from "@/lib/courseDates";
import { isWaitingTeacherName } from "@/lib/teacherAssignment";

type NotifyResult = { status: "通知成功" | "通知失敗" | "不需通知"; error?: string };

export type SchoolCourseChangeKind = "cancelled" | "substitute" | "substitute_pending" | "teacher_changed";

type SchoolCourseChangeInput = {
  attendanceId: number;
  kind: SchoolCourseChangeKind;
  teacherName?: string;
  role?: "主教" | "助教";
  reason?: string;
  forceSend?: boolean;
};

function isoDayDistance(fromIso: string, toIso: string) {
  return Math.round((Date.parse(`${toIso}T00:00:00.000Z`) - Date.parse(`${fromIso}T00:00:00.000Z`)) / 86400000);
}

async function setNotifyStatus(attendanceId: number, status: string, error = "") {
  await prisma.$executeRawUnsafe(
    "UPDATE Attendance SET schoolNotifyStatus = ?, schoolNotifyError = ?, schoolNotifiedAt = ? WHERE id = ?",
    status,
    error,
    status === "通知成功" ? new Date().toISOString() : null,
    attendanceId,
  );
}

let schoolLineRegionColumnReady = false;

async function ensureSchoolLineRegionColumn() {
  if (schoolLineRegionColumnReady) return;
  await prisma.$executeRawUnsafe('ALTER TABLE School ADD COLUMN lineRegion TEXT NOT NULL DEFAULT "school"').catch(() => undefined);
  schoolLineRegionColumnReady = true;
}

async function getSchoolLineRegion(schoolId: number): Promise<LineRegion> {
  await ensureSchoolLineRegionColumn();
  const rows = await prisma.$queryRawUnsafe<Array<{ lineRegion: string | null }>>(
    "SELECT lineRegion FROM School WHERE id = ? LIMIT 1",
    schoolId,
  );
  const region = rows[0]?.lineRegion;
  return region === "school2" ? "school2" : "school";
}

let courseChangeNotificationTableReady = false;

async function ensureCourseChangeNotificationTable() {
  if (courseChangeNotificationTableReady) return;
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "SchoolCourseChangeNotification" (
      "id" INTEGER PRIMARY KEY AUTOINCREMENT,
      "attendanceId" INTEGER NOT NULL,
      "eventKey" TEXT NOT NULL UNIQUE,
      "eventType" TEXT NOT NULL,
      "schoolId" INTEGER,
      "status" TEXT NOT NULL DEFAULT '待發送',
      "attempts" INTEGER NOT NULL DEFAULT 0,
      "error" TEXT NOT NULL DEFAULT '',
      "sentAt" DATETIME,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await prisma.$executeRawUnsafe(
    'CREATE INDEX IF NOT EXISTS "SchoolCourseChangeNotification_attendanceId_idx" ON "SchoolCourseChangeNotification" ("attendanceId")',
  );
  courseChangeNotificationTableReady = true;
}

/**
 * 將停課／代課異動通知園所。通知失敗只留紀錄，不回滾已完成的課務異動。
 * eventKey 包含異動內容，可防止同一操作因重送 API 而重複通知。
 */
export async function notifySchoolCourseChange(input: SchoolCourseChangeInput): Promise<NotifyResult> {
  try {
    await ensureSchoolLineRegionColumn();
    await ensureCourseChangeNotificationTable();
    const attendance = await prisma.attendance.findUnique({
      where: { id: input.attendanceId },
      include: {
        course: { include: { schoolRel: true } },
        actualTeacher: { select: { name: true } },
        assistantTeacher: { select: { name: true } },
      },
    });
    if (!attendance) return { status: "通知失敗", error: "找不到出勤紀錄" };

    const school = attendance.scheduledSchoolId
      ? await prisma.school.findUnique({ where: { id: attendance.scheduledSchoolId } })
      : attendance.course.schoolRel
        ?? await prisma.school.findFirst({ where: { name: attendance.scheduledSchoolName.trim() || attendance.course.school } });
    const eventValue = input.kind === "cancelled"
      ? input.reason?.trim() || attendance.cancelReason?.trim() || "停課"
      : input.kind === "substitute_pending"
        ? "代課老師重新安排中"
      : `${input.role || "主教"}:${input.teacherName || attendance.actualTeacher.name}`;
    const eventKey = `${attendance.id}:${input.kind}:${eventValue}`;
    const existing = await prisma.$queryRawUnsafe<Array<{ status: string }>>(
      'SELECT "status" FROM "SchoolCourseChangeNotification" WHERE "eventKey" = ? LIMIT 1',
      eventKey,
    );
    if (existing[0]?.status === "通知成功") return { status: "不需通知" };
    await prisma.$executeRawUnsafe(
      `INSERT INTO "SchoolCourseChangeNotification" ("attendanceId", "eventKey", "eventType", "schoolId")
       VALUES (?, ?, ?, ?)
       ON CONFLICT("eventKey") DO UPDATE SET "updatedAt" = CURRENT_TIMESTAMP`,
      attendance.id, eventKey, input.kind, school?.id ?? null,
    );

    // 異動在很早以前登記也不能漏掉：先保留待發送，統一於上課前兩天由排程送出。
    // 距離上課不足兩天的臨時異動則立即通知；過期課程不再打擾園所。
    if (!input.forceSend) {
      const daysUntilCourse = isoDayDistance(taipeiDateIso(), attendance.date.toISOString().slice(0, 10));
      if (daysUntilCourse > 2) return { status: "不需通知" };
      if (daysUntilCourse < 0) {
        await prisma.$executeRawUnsafe(
          `UPDATE "SchoolCourseChangeNotification" SET "status" = '已過期', "updatedAt" = CURRENT_TIMESTAMP WHERE "eventKey" = ?`,
          eventKey,
        );
        return { status: "不需通知" };
      }
    }

    if (!school?.lineUserId) {
      const error = "園所尚未綁定 LINE";
      await prisma.$executeRawUnsafe(
        `UPDATE "SchoolCourseChangeNotification" SET "status" = '未發送', "error" = ?, "updatedAt" = CURRENT_TIMESTAMP WHERE "eventKey" = ?`,
        error, eventKey,
      );
      const { raiseSystemAlert } = await import("@/lib/systemAlerts");
      await raiseSystemAlert({
        level: "P2",
        category: "園所通知",
        title: `${school?.name || attendance.course.school} 未收到${input.kind === "cancelled" ? "停課" : "師資異動"}通知`,
        detail: `${attendance.date.toISOString().slice(0, 10)}｜${attendance.course.courseType}｜園所尚未綁定 LINE`,
        dedupeKey: `school-change-unbound:${eventKey}`,
      });
      return { status: "不需通知", error };
    }
    const schoolRegion = await getSchoolLineRegion(school.id);
    const token = getLineConfig(schoolRegion).token;
    if (!token) throw new Error(schoolRegion === "school2" ? "LINE_SCHOOL2_TOKEN 尚未設定" : "LINE_SCHOOL_TOKEN 尚未設定");

    const date = attendance.date.toISOString().slice(0, 10);
    const time = attendance.scheduledTime?.trim() || attendance.course.time || "時間待確認";
    const courseType = attendance.course.courseType;
    const heading = input.kind === "cancelled" ? "【停課通知】" : "【師資異動通知】";
    const detail = input.kind === "cancelled"
      ? `本堂課已停課${eventValue && eventValue !== "停課" ? `\n原因：${eventValue}` : ""}`
      : input.kind === "substitute_pending"
        ? "原代課安排已取消，新的代課老師確認中；確認後會再通知"
      : `${input.role || "主教"}改由 ${input.teacherName || attendance.actualTeacher.name} 老師授課`;
    const text = [
      heading,
      school.name,
      `日期：${date}`,
      `時間：${time}`,
      `課程：${courseType}`,
      `異動：${detail}`,
      "",
      "若有疑問，請直接聯繫 WaysLeader AI 課務人員。",
    ].join("\n");

    await pushMessage(school.lineUserId, [{ type: "text", text }], token);
    await prisma.$executeRawUnsafe(
      `UPDATE "SchoolCourseChangeNotification"
       SET "status" = '通知成功', "attempts" = "attempts" + 1, "error" = '', "sentAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
       WHERE "eventKey" = ?`,
      eventKey,
    );
    return { status: "通知成功" };
  } catch (error) {
    const message = (error as Error).message || "園所異動通知發送失敗";
    await ensureCourseChangeNotificationTable().then(() => prisma.$executeRawUnsafe(
      `UPDATE "SchoolCourseChangeNotification"
       SET "status" = '通知失敗', "attempts" = "attempts" + 1, "error" = ?, "updatedAt" = CURRENT_TIMESTAMP
       WHERE "attendanceId" = ? AND "status" != '通知成功'`,
      message.slice(0, 500), input.attendanceId,
    )).catch(() => undefined);
    console.error(`[school-course-change] attendance ${input.attendanceId}:`, message);
    const { raiseSystemAlert } = await import("@/lib/systemAlerts");
    await raiseSystemAlert({
      level: "P2",
      category: "園所通知",
      title: `課堂 #${input.attendanceId} 的園所異動通知失敗`,
      detail: message.slice(0, 500),
      dedupeKey: `school-change-failed:${input.attendanceId}:${input.kind}`,
    }).catch(() => undefined);
    return { status: "通知失敗", error: message };
  }
}

/** 將指定日期所有曾有異動的課，以「目前最後狀態」通知園所。 */
export async function flushSchoolCourseChangesForDate(targetDate: string) {
  await ensureCourseChangeNotificationTable();
  const rows = await prisma.$queryRawUnsafe<Array<{ attendanceId: number; eventType: string }>>(
    `SELECT DISTINCT n."attendanceId", n."eventType"
     FROM "SchoolCourseChangeNotification" n
     JOIN "Attendance" a ON a."id" = n."attendanceId"
     WHERE date(a."date") = date(?)
       AND n."status" IN ('待發送', '未發送', '通知失敗')
       AND n."eventType" IN ('cancelled', 'substitute', 'substitute_pending', 'teacher_changed')`,
    targetDate,
  );
  const eventTypesByAttendance = new Map<number, Set<string>>();
  for (const row of rows) {
    const types = eventTypesByAttendance.get(Number(row.attendanceId)) ?? new Set<string>();
    types.add(row.eventType);
    eventTypesByAttendance.set(Number(row.attendanceId), types);
  }
  const attendances = await prisma.attendance.findMany({
    where: { id: { in: [...eventTypesByAttendance.keys()] } },
    include: {
      course: true,
      actualTeacher: { select: { name: true } },
      assistantTeacher: { select: { name: true } },
    },
  });
  let sent = 0;
  let failed = 0;
  const errors: string[] = [];
  for (const attendance of attendances) {
    const notifications: SchoolCourseChangeInput[] = [];
    if (attendance.cancelled) {
      notifications.push({ attendanceId: attendance.id, kind: "cancelled", reason: attendance.cancelReason || "停課", forceSend: true });
    } else if (isWaitingTeacherName(attendance.actualTeacher.name)) {
      notifications.push({ attendanceId: attendance.id, kind: "substitute_pending", role: "主教", forceSend: true });
    } else {
      if (attendance.actualTeacherId !== attendance.course.teacherId) {
        notifications.push({ attendanceId: attendance.id, kind: "teacher_changed", role: "主教", teacherName: attendance.actualTeacher.name, forceSend: true });
      }
      if (attendance.assistantTeacher && attendance.assistantTeacherId !== attendance.course.assistantTeacherId) {
        notifications.push({ attendanceId: attendance.id, kind: "teacher_changed", role: "助教", teacherName: attendance.assistantTeacher.name, forceSend: true });
      }
      if (notifications.length === 0) {
        notifications.push({ attendanceId: attendance.id, kind: "teacher_changed", role: "主教", teacherName: attendance.actualTeacher.name, forceSend: true });
      }
    }
    const results: NotifyResult[] = [];
    for (const notification of notifications) results.push(await notifySchoolCourseChange(notification));
    const error = results.find((result) => result.status === "通知失敗" || result.error)?.error;
    if (error) {
      failed += 1;
      errors.push(`課堂 #${attendance.id}：${error}`);
      continue;
    }
    await prisma.$executeRawUnsafe(
      `UPDATE "SchoolCourseChangeNotification"
       SET "status" = '通知成功', "error" = '', "sentAt" = COALESCE("sentAt", CURRENT_TIMESTAMP), "updatedAt" = CURRENT_TIMESTAMP
       WHERE "attendanceId" = ? AND "status" IN ('待發送', '未發送', '通知失敗')`,
      attendance.id,
    );
    sent += 1;
  }
  return { total: attendances.length, sent, failed, errors };
}

function appUrl() {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  return "https://talent-class-system.vercel.app";
}

let notifyColumnsReady = false;

async function ensureNotifyColumns() {
  if (notifyColumnsReady) return;
  await prisma.$executeRawUnsafe(
    'ALTER TABLE Attendance ADD COLUMN schoolNotifyStatus TEXT NOT NULL DEFAULT "未通知"',
  ).catch(() => undefined);
  await prisma.$executeRawUnsafe(
    'ALTER TABLE Attendance ADD COLUMN schoolNotifyError TEXT NOT NULL DEFAULT ""',
  ).catch(() => undefined);
  await prisma.$executeRawUnsafe("ALTER TABLE Attendance ADD COLUMN schoolNotifiedAt DATETIME").catch(() => undefined);
  notifyColumnsReady = true;
}

export async function notifySchoolReport(attendanceId: number): Promise<NotifyResult> {
  try {
    await ensureNotifyColumns();

    const att = await prisma.attendance.findUnique({
      where: { id: attendanceId },
      include: { course: { include: { schoolRel: true } }, actualTeacher: true },
    });
    if (!att) {
      await setNotifyStatus(attendanceId, "通知失敗", "找不到出勤紀錄");
      return { status: "通知失敗", error: "找不到出勤紀錄" };
    }

    const isAfterSchool = (att.course.department ?? "").includes("安親");
    if (isAfterSchool && (att.cancelled || !att.course.schoolRel?.lineUserId)) {
      // 安親班：停課或未綁 LINE 就不發（評分連結仍可由後台手動複製轉發）
      return { status: "不需通知" };
    }

    const school = att.course.schoolRel;
    if (!school?.lineUserId) {
      await setNotifyStatus(attendanceId, "通知失敗", "園所尚未綁定 LINE User ID");
      return { status: "通知失敗", error: "園所尚未綁定 LINE User ID" };
    }

    const schoolRegion = await getSchoolLineRegion(school.id);
    const schoolCfg = getLineConfig(schoolRegion);
    if (!schoolCfg.token) {
      const missingKey = schoolRegion === "school2" ? "LINE_SCHOOL2_TOKEN 尚未設定" : "LINE_SCHOOL_TOKEN 尚未設定";
      await setNotifyStatus(attendanceId, "通知失敗", missingKey);
      return { status: "通知失敗", error: missingKey };
    }

    // 安親班：課後改發「評分邀請」而不是幼兒園回報訊息
    if (isAfterSchool) {
      const { getOrCreateRating } = await import("@/lib/courseRating");
      const rating = await getOrCreateRating(attendanceId);
      if (rating.status !== "open") return { status: "不需通知" }; // 已評分/已關閉不再發邀請
      const text = [
        `【課程評分邀請】${att.course.school}`,
        `課程：${att.course.courseType}（${att.course.code}）`,
        `日期：${att.date.toISOString().slice(0, 10)}`,
        `授課老師：${att.actualTeacher.name}`,
        "",
        "今天的課程已結束，麻煩協助評分（約 1 分鐘，點連結即可填寫、免登入）：",
        `${appUrl()}/rating/${rating.token}`,
        "",
        "感謝您的回饋！",
      ].join("\n");
      const res = await fetch("https://api.line.me/v2/bot/message/push", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${schoolCfg.token}` },
        body: JSON.stringify({ to: school.lineUserId, messages: [{ type: "text", text }] }),
      });
      if (!res.ok) {
        const body = await res.text();
        const error = `LINE ${res.status}: ${body.slice(0, 300)}`;
        await setNotifyStatus(attendanceId, "通知失敗", error);
        return { status: "通知失敗", error };
      }
      await setNotifyStatus(attendanceId, "通知成功");
      return { status: "通知成功" };
    }

    const attData = att as unknown as { studentCount: number | null; studentCountA: number | null; studentCountB: number | null };
    const displayCount = attData.studentCount ??
      (attData.studentCountA != null && attData.studentCountB != null
        ? attData.studentCountA + attData.studentCountB
        : attData.studentCountA ?? attData.studentCountB ?? null);

    const msg = schoolRegion === "school2"
      ? buildUpbearSchoolReportMessage({
          teacherName: att.actualTeacher.name,
          courseType: att.course.courseType,
          date: att.date.toISOString().slice(0, 10),
          studentCount: displayCount,
          portalUrl: `${appUrl()}/school-portal/${encodeURIComponent(await getOrCreatePortalCode(school.id))}`,
          content: att.reportContent,
        })
      : buildSchoolReportMessage({
          teacherName: att.actualTeacher.name,
          school: att.course.school,
          courseType: att.course.courseType,
          date: att.date.toISOString().slice(0, 10),
          expectedStudentCount: (await expectedStudentCountMap([attendanceId])).get(attendanceId) ?? null,
          studentCount: displayCount,
          portalUrl: `${appUrl()}/school-portal/${encodeURIComponent(await getOrCreatePortalCode(school.id))}`,
          content: att.reportContent,
          cancelled: att.cancelled,
        });

    const res = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${schoolCfg.token}` },
      body: JSON.stringify({ to: school.lineUserId, messages: [msg] }),
    });

    if (!res.ok) {
      const body = await res.text();
      const error = `LINE ${res.status}: ${body.slice(0, 300)}`;
      await setNotifyStatus(attendanceId, "通知失敗", error);
      return { status: "通知失敗", error };
    }

    await setNotifyStatus(attendanceId, "通知成功");
    await prisma.attendance.update({ where: { id: attendanceId }, data: { reportSentAt: new Date() } });
    return { status: "通知成功" };
  } catch (e) {
    const error = (e as Error).message || "園所通知發送失敗";
    await setNotifyStatus(attendanceId, "通知失敗", error).catch(() => undefined);
    return { status: "通知失敗", error };
  }
}
