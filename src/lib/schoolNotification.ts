import { prisma } from "@/lib/prisma";
import { buildSchoolReportMessage, getLineConfig } from "@/lib/line";
import type { LineRegion } from "@/lib/line";

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

async function ensureSchoolLineRegionColumn() {
  await prisma.$executeRawUnsafe('ALTER TABLE School ADD COLUMN lineRegion TEXT NOT NULL DEFAULT "school"').catch(() => undefined);
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

export async function notifySchoolReport(attendanceId: number): Promise<NotifyResult> {
  try {
    await prisma.$executeRawUnsafe(
      'ALTER TABLE Attendance ADD COLUMN schoolNotifyStatus TEXT NOT NULL DEFAULT "未通知"',
    ).catch(() => undefined);
    await prisma.$executeRawUnsafe(
      'ALTER TABLE Attendance ADD COLUMN schoolNotifyError TEXT NOT NULL DEFAULT ""',
    ).catch(() => undefined);
    await prisma.$executeRawUnsafe("ALTER TABLE Attendance ADD COLUMN schoolNotifiedAt DATETIME").catch(() => undefined);

    const att = await prisma.attendance.findUnique({
      where: { id: attendanceId },
      include: { course: { include: { schoolRel: true } }, actualTeacher: true },
    });
    if (!att) {
      await setNotifyStatus(attendanceId, "通知失敗", "找不到出勤紀錄");
      return { status: "通知失敗", error: "找不到出勤紀錄" };
    }

    if ((att.course.department ?? "").includes("安親")) {
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

    const attData = att as unknown as { studentCount: number | null; studentCountA: number | null; studentCountB: number | null };
    const displayCount = attData.studentCount ??
      (attData.studentCountA != null && attData.studentCountB != null
        ? attData.studentCountA + attData.studentCountB
        : attData.studentCountA ?? attData.studentCountB ?? null);

    const msg = buildSchoolReportMessage({
      teacherName: att.actualTeacher.name,
      school: att.course.school,
      courseType: att.course.courseType,
      date: att.date.toISOString().slice(0, 10),
      studentCount: displayCount,
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
