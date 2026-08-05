import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { LEAVE_STATUS } from "@/lib/teacherLeaves";
import { raiseSystemAlert } from "@/lib/systemAlerts";
import { findWaitingTeacherId } from "@/lib/pendingSubstitute";

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
  // 用 Date 物件而不是 ISO 字串去比 DateTime 欄位（見下方項目 1 的說明）
  const startOfToday = new Date(`${now.toISOString().slice(0, 10)}T00:00:00.000Z`);
  const in48h = new Date(now.getTime() + 48 * 3600 * 1000);
  const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 3600 * 1000);
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 3600 * 1000);
  const created = { substituteVacant: 0, unreported: 0, unlinkedCourse: 0, notifyFailed: 0 };

  // 1. 代課懸空（48 小時內開課仍在找代課）
  //
  // 這段原本是原生 SQL，把 leaveDate（DateTime）拿去和 ISO 字串比大小。Prisma 在
  // SQLite/libSQL 把 DateTime 存成整數毫秒，而 SQLite 的型別優先序是
  // NULL < INTEGER/REAL < TEXT < BLOB —— 「整數 >= 字串」恆為 false，所以這個查詢
  // 從來沒有回傳過任何一筆。它是全系統唯一會主動抓「明天有課但沒人上」的守門員，
  // 而它一直是壞的。改用 Prisma 查詢，型別轉換交給 Prisma 處理。
  //
  // 另外補上「真的沒人代」的判斷：光看請假單狀態不夠，行政可能已經指派好代課
  // 但忘了把單子狀態改掉。以出勤上的 actualTeacherId 為準 —— 還掛在請假老師身上
  // 才算懸空，已經換人就不用叫。
  //
  // 也拿掉了原本的 .catch(() => [])：SQL 真的炸掉時整段會靜默跳過，
  // 這正是這個 bug 活到今天沒被發現的原因。現在讓它往外拋，cron 會回 500 而不是假裝正常。
  const leaveCandidates = await prisma.teacherLeaveRequest.findMany({
    where: {
      status: { in: [LEAVE_STATUS.approved, LEAVE_STATUS.searching] },
      leaveDate: { gte: startOfToday, lte: in48h },
    },
    select: {
      id: true, leaveDate: true, startTime: true, endTime: true, status: true, teacherId: true, role: true,
      teacher: { select: { name: true } },
      course: { select: { school: true, courseType: true } },
      attendance: { select: { actualTeacherId: true, assistantTeacherId: true, cancelled: true } },
    },
  });
  // 「待排老師」是核准請假後掛上去的佔位帳號，代表課還沒人接，一樣算懸空。
  // 不把它算進來的話，P1-7 標記待指派代課的那一步會順手把這個告警關掉。
  const waitingTeacherId = await findWaitingTeacherId();
  // 已取消的課不用找代課；已經換成別的真人老師代表代課已補上。
  // 角色要分開看：助教請假時該檢查的是 assistantTeacherId，看主教會永遠判成「已補上」。
  const vacantLeaves = leaveCandidates.filter((leave) => {
    if (!leave.attendance) return true;
    if (leave.attendance.cancelled) return false;
    const onDuty = leave.role === "助教" ? leave.attendance.assistantTeacherId : leave.attendance.actualTeacherId;
    return onDuty === leave.teacherId || (waitingTeacherId != null && onDuty === waitingTeacherId);
  });
  for (const leave of vacantLeaves) {
    const leaveDateIso = leave.leaveDate.toISOString().slice(0, 10);
    const isNew = await raiseSystemAlert({
      level: "P1",
      category: "代課懸空",
      title: `${leaveDateIso} ${leave.course.school}｜${leave.course.courseType} 即將開課仍無代課老師`,
      detail: `${leave.startTime}-${leave.endTime}｜原請假老師：${leave.teacher.name}｜請假單狀態：${leave.status}`,
      dedupeKey: `sub-vacant:${leave.id}:${leaveDateIso}`,
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
  // 和項目 1 完全相同的病：a."date" 是整數毫秒，卻拿 ISO 字串去比，整數 >= 字串恆為 false。
  // 這條也一樣從來沒有回傳過任何一筆，而且同樣被 .catch(() => []) 蓋住。改用 Prisma。
  const notifyFailed = await prisma.attendance.findMany({
    where: { schoolNotifyStatus: "通知失敗", date: { gte: fourteenDaysAgo } },
    select: {
      id: true, date: true, schoolNotifyError: true,
      course: { select: { school: true, courseType: true } },
    },
  });
  for (const att of notifyFailed) {
    const isNew = await raiseSystemAlert({
      level: "P2",
      category: "通知失敗",
      title: `${att.date.toISOString().slice(0, 10)} ${att.course.school}｜${att.course.courseType} 園所 LINE 通知失敗`,
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
