import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { LEAVE_STATUS } from "@/lib/teacherLeaves";
import { raiseSystemAlert } from "@/lib/systemAlerts";

export const maxDuration = 60;

/**
 * 每日資料一致性掃描（M12）：把系統裡「錢會不見 / 課會開天窗」的狀況開成異常單。
 * 掃描項目：
 * 1. 代課懸空（P1）：請假已核准/尋找代課中，開課日在 48 小時內仍無人代課
 * 2. 未回報課程（P2）：課已上完 2 天以上仍無回報（照算薪資，但需行政核對）
 * 3. 請款斷鏈（P2）：課程沒連到任何園所 → 永遠不會出現在請款單
 * 4. 園所通知失敗（P2）：課後回報推播園所失敗
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const todayIso = now.toISOString().slice(0, 10);
  const in48h = new Date(now.getTime() + 48 * 3600 * 1000);
  const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 3600 * 1000);
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 3600 * 1000);
  const created = { substituteVacant: 0, unreported: 0, unlinkedCourse: 0, notifyFailed: 0 };

  // 1. 代課懸空（48 小時內開課仍在找代課）
  const vacantLeaves = await prisma.$queryRawUnsafe<Array<{
    id: number; leaveDate: string; startTime: string; endTime: string;
    status: string; teacherName: string; school: string; courseType: string;
  }>>(
    `SELECT lr."id", lr."leaveDate", lr."startTime", lr."endTime", lr."status",
            t."name" AS "teacherName", c."school", c."courseType"
     FROM "TeacherLeaveRequest" lr
     JOIN "Teacher" t ON t."id" = lr."teacherId"
     JOIN "Course" c ON c."id" = lr."courseId"
     WHERE lr."status" IN (?, ?)
       AND lr."leaveDate" >= ? AND lr."leaveDate" <= ?`,
    LEAVE_STATUS.approved,
    LEAVE_STATUS.searching,
    todayIso,
    in48h.toISOString(),
  ).catch(() => [] as never[]);
  for (const leave of vacantLeaves) {
    const isNew = await raiseSystemAlert({
      level: "P1",
      category: "代課懸空",
      title: `${String(leave.leaveDate).slice(0, 10)} ${leave.school}｜${leave.courseType} 即將開課仍無代課老師`,
      detail: `${leave.startTime}-${leave.endTime}｜原請假老師：${leave.teacherName}｜請假單狀態：${leave.status}`,
      dedupeKey: `sub-vacant:${leave.id}:${String(leave.leaveDate).slice(0, 10)}`,
    });
    if (isNew) created.substituteVacant++;
  }

  // 2. 未回報課程（上完 2 天以上、14 天內，未取消且回報為空）
  const unreported = await prisma.attendance.findMany({
    where: {
      date: { gte: fourteenDaysAgo, lt: twoDaysAgo },
      cancelled: false,
      reportContent: "",
    },
    select: {
      id: true, date: true,
      actualTeacher: { select: { name: true } },
      course: { select: { school: true, courseType: true } },
    },
  });
  for (const att of unreported) {
    const dateIso = att.date.toISOString().slice(0, 10);
    const isNew = await raiseSystemAlert({
      level: "P2",
      category: "未回報",
      title: `${dateIso} ${att.course.school}｜${att.course.courseType} 課後回報未完成（照算薪資，請行政核對）`,
      detail: `老師：${att.actualTeacher.name}｜出勤 #${att.id}`,
      dedupeKey: `unreported:${att.id}`,
    });
    if (isNew) created.unreported++;
  }

  // 3. 請款斷鏈（schoolId 為 null 且名稱比對不到 School）
  const [courses, schools] = await Promise.all([
    prisma.course.findMany({
      where: { isActive: true, schoolId: null },
      select: { id: true, code: true, school: true, courseType: true, _count: { select: { attendances: true } } },
    }),
    prisma.school.findMany({ select: { name: true } }),
  ]);
  const schoolNames = new Set(schools.map((s) => s.name.trim()));
  for (const course of courses) {
    if (schoolNames.has(course.school.trim())) continue;
    const isNew = await raiseSystemAlert({
      level: "P2",
      category: "請款斷鏈",
      title: `課程「${course.code}」（${course.school}｜${course.courseType}）未連結任何園所，不會出現在請款單`,
      detail: `已有 ${course._count.attendances} 筆出勤。請至課程管理補上園所連結，或用 /api/setup/school-link-check 檢查。`,
      dedupeKey: `unlinked-course:${course.id}`,
    });
    if (isNew) created.unlinkedCourse++;
  }

  // 4. 園所通知失敗（近 14 天）
  const notifyFailed = await prisma.$queryRawUnsafe<Array<{
    id: number; date: string; schoolNotifyError: string; school: string; courseType: string;
  }>>(
    `SELECT a."id", a."date", a."schoolNotifyError", c."school", c."courseType"
     FROM "Attendance" a
     JOIN "Course" c ON c."id" = a."courseId"
     WHERE a."schoolNotifyStatus" = '通知失敗' AND a."date" >= ?`,
    fourteenDaysAgo.toISOString(),
  ).catch(() => [] as never[]);
  for (const att of notifyFailed) {
    const isNew = await raiseSystemAlert({
      level: "P2",
      category: "通知失敗",
      title: `${String(att.date).slice(0, 10)} ${att.school}｜${att.courseType} 園所 LINE 通知失敗`,
      detail: `${att.schoolNotifyError}｜出勤 #${att.id}。可至出勤頁重送。`,
      dedupeKey: `notify-fail:${att.id}`,
    });
    if (isNew) created.notifyFailed++;
  }

  return NextResponse.json({
    ok: true,
    scanned: {
      substituteVacant: vacantLeaves.length,
      unreported: unreported.length,
      unlinkedCourse: courses.length,
      notifyFailed: notifyFailed.length,
    },
    newAlerts: created,
  });
}
