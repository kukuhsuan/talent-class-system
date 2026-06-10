import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { notifySchoolReport } from "@/lib/schoolNotification";
import {
  LineRegion, getLineConfig, verifyLineSignature,
  replyMessage, pushMessage,
  buildReportRequestMessage, buildCurriculumSelectMessage, buildStudentCountBoard, buildTwoMonthScheduleMessage, generateBindCode,
} from "@/lib/line";
import { formatMonthDay, taipeiDateIso, weekdayOfIso } from "@/lib/courseDates";
import { courseIdsWithAnyAttendance, dayBounds, dayNameOfIso } from "@/lib/scheduleLogic";
import { attendanceScheduledTimeMap, stampAttendanceTime } from "@/lib/attendanceTime";
import { courseLabel, normalizeCategory, requiresStudentCount } from "@/lib/courseMeta";
import { attendanceHoursFromCourseTime } from "@/lib/courseHours";
import { isPendingReport } from "@/lib/reportWindow";

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
  if (region === "school") {
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
    await saveDetailedReport(userId, pendingId, text, replyToken, token, region);
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
      id: number; date: Date; category: string; hours: number;
      studentCount: number | null; studentCountA: number | null; studentCountB: number | null;
      reportContent: string; cancelled: boolean;
      course: { id: number; school: string; courseType: string; category: string; department: string; time: string };
    }>>);
    const pastScheduledTimeMap = await attendanceScheduledTimeMap(pastRaw.map((a) => a.id));
    const pendingPast = pastRaw.filter((att) => {
      const scheduledTime = pastScheduledTimeMap.get(att.id) || att.course.time || "";
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
      }) as unknown as Promise<Array<{ id: number; course: { id: number; school: string; courseType: string; category: string; department: string; time: string } }>>,
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
      atts.push({ id: att.id, school: att.course.school, courseType: att.course.courseType, department: att.course.department, dateLabel: formatMonthDay(iso) });
    }

    // 今日課程
    for (const att of scheduledAttendances) {
      atts.push({ id: att.id, school: att.course.school, courseType: att.course.courseType, department: att.course.department });
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
    }) as unknown as Array<{ id: number; school: string; courseType: string; dayOfWeek: string; time: string; department: string; address?: string; schoolRel?: { address?: string } | null }>;

    if (courses.length === 0) {
      await replyMessage(replyToken, [{ type: "text", text: `${teacher.name} 老師，目前沒有排定的課程。` }], token);
      return;
    }

    const DAY_JS: Record<string, number> = {
      "星期一": 1, "星期二": 2, "星期三": 3, "星期四": 4,
      "星期五": 5, "星期六": 6, "星期日": 0,
    };
    const now = new Date();
    const targetYear = now.getFullYear();

    const yearStart = new Date(targetYear, 0, 1);
    const yearEnd = new Date(targetYear, 11, 31, 23, 59, 59, 999);

    const actualRows = await prisma.attendance.findMany({
      where: {
        actualTeacherId: teacher.id,
        cancelled: false,
        date: { gte: yearStart, lte: yearEnd },
      },
      include: { course: { include: { schoolRel: true } } },
      orderBy: { date: "asc" },
    }) as unknown as Array<{
      id: number;
      date: Date;
      course: { id: number; school: string; courseType: string; time: string; address?: string; schoolRel?: { address?: string } | null };
    }>;
    const actualTimeMap = await attendanceScheduledTimeMap(actualRows.map((row) => row.id));

    const fmt = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`;

    // 安親班課程優先（有 department 含「安親」的優先顯示）
    const anqinCourses = courses.filter((c: { department?: string }) => c.department?.includes("安親"));
    const displayCourses = anqinCourses.length > 0 ? anqinCourses : courses;
    const displayCourseIds = new Set(displayCourses.map((course) => course.id));
    const scheduleNearDate = new Date();
    const datedCourseIds = await courseIdsWithAnyAttendance({
      isActive: true,
      id: { in: [...displayCourseIds] },
    }, scheduleNearDate);

    const weeks: Array<{
      label: string;
      month: string;
      entries: Array<{ date: string; dayShort: string; school: string; courseType: string; time: string; address?: string }>;
    }> = [];
    type ScheduleEntryRow = {
      date: string;
      dayShort: string;
      school: string;
      courseType: string;
      time: string;
      address?: string;
      sortKey: number;
    };

    for (let month = 0; month < 12; month++) {
      const monthStart = new Date(targetYear, month, 1);
      const monthEnd = new Date(targetYear, month + 1, 0, 23, 59, 59, 999);
      const entries = [
        ...actualRows
          .filter((a) => displayCourseIds.has(a.course.id) && a.date >= monthStart && a.date <= monthEnd)
          .map((a): ScheduleEntryRow => {
            const iso = a.date.toISOString().slice(0, 10);
            const weekday = weekdayOfIso(iso);
            return {
              date: formatMonthDay(iso),
              dayShort: weekday.replace("星期", ""),
              school: a.course.school,
              courseType: a.course.courseType,
              time: actualTimeMap.get(a.id) || a.course.time,
              address: a.course.address || a.course.schoolRel?.address || "",
              sortKey: a.date.getTime(),
            };
          }),
        ...displayCourses
          .filter((c) => !datedCourseIds.has(c.id))
          .filter((c: { dayOfWeek: string }) => DAY_JS[c.dayOfWeek] !== undefined)
          .flatMap((c: { dayOfWeek: string; school: string; courseType: string; time: string; address?: string; schoolRel?: { address?: string } | null }) => {
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
          .map(({ date, dayShort, school, courseType, time, address }) => ({ date, dayShort, school, courseType, time, address })),
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

  if (region === "school") {
    if (looksLikeBindCode) {
      const school = await prisma.school.findFirst({ where: { lineBindCode: upper } });
      if (school) {
        await prisma.school.update({ where: { id: school.id }, data: { lineUserId: userId } });
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

  if (action === "select_progress") {
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

  // New: handle count board submission via postback
  if (action === "report_count") {
    const group = params.get("group") ?? "";
    const count = Number(params.get("count"));
    await handleCountSubmit(userId, attendanceId, group, count, replyToken, token);
    return;
  }

  if (action === "report") {
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
