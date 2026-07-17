import { prisma } from "@/lib/prisma";
import { expectedStudentCountMap } from "@/lib/expectedStudentCount";
import { buildSchoolReportMessage, getLineConfig } from "@/lib/line";
import type { LineRegion } from "@/lib/line";
import { getOrCreatePortalCode } from "@/lib/schoolPortalAccess";

type NotifyResult = { status: "通知成功" | "通知失敗" | "不需通知"; error?: string };

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

    const expectedMap = await expectedStudentCountMap([attendanceId]);
    const portalCode = await getOrCreatePortalCode(school.id);
    const msg = buildSchoolReportMessage({
      teacherName: att.actualTeacher.name,
      school: att.course.school,
      courseType: att.course.courseType,
      date: att.date.toISOString().slice(0, 10),
      expectedStudentCount: expectedMap.get(attendanceId) ?? null,
      studentCount: displayCount,
      portalUrl: `${appUrl()}/school-portal/${encodeURIComponent(portalCode)}`,
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
