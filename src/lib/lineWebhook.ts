import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  LineRegion, getLineConfig, verifyLineSignature,
  replyMessage, pushMessage,
  buildReportRequestMessage, buildCurriculumSelectMessage, buildSchoolReportMessage, buildStudentCountBoard, generateBindCode,
} from "@/lib/line";

type LineEvent = {
  type: string;
  replyToken?: string;
  source: { userId: string };
  message?: { type: string; text: string };
  postback?: { data: string };
};

// Track teachers mid-report (userId -> attendanceId awaiting detail)
const pendingDetails = new Map<string, number>();

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
    // Auto-bind: check if userId already in DB
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
    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const end = new Date(start.getTime() + 86400000);
    const dayNames = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
    const todayDay = dayNames[today.getDay()];

    // Find today's scheduled courses for this teacher
    const courses = await prisma.course.findMany({
      where: { teacherId: teacher.id, dayOfWeek: todayDay, isActive: true },
    }) as unknown as Array<{ id: number; school: string; courseType: string; category: string }>;

    if (courses.length === 0) {
      await replyMessage(replyToken, [{ type: "text", text: `${teacher.name} 老師，今天（${todayDay}）沒有排課。` }], token);
      return;
    }

    // Find or auto-create attendance records
    const atts: Array<{ id: number; school: string; courseType: string }> = [];
    for (const course of courses) {
      let att = await prisma.attendance.findFirst({
        where: { courseId: course.id, date: { gte: start, lt: end } },
      }) as { id: number } | null;
      if (!att) {
        att = await prisma.attendance.create({
          data: { date: today, courseId: course.id, actualTeacherId: teacher.id, category: course.category, hours: 1 },
        }) as { id: number };
      }
      atts.push({ id: att.id, school: course.school, courseType: course.courseType });
    }

    const messages = atts.map((a) => buildReportRequestMessage({ school: a.school, courseType: a.courseType, attendanceId: a.id }));
    await replyMessage(replyToken, [
      { type: "text", text: `${teacher.name} 老師，您今天有 ${atts.length} 堂課，請依序回報：` },
      ...messages.slice(0, 4),
    ], token);
    return;
  }

  // Parse student count report: "幼兒園 16", "國小 12", "安親 8"
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
      // Find today's most recent uncancelled attendance (no department filter to be safe)
      const att = await prisma.attendance.findFirst({
        where: { actualTeacherId: teacher.id, date: { gte: start, lt: end }, cancelled: false },
        orderBy: { id: "desc" },
      });
      if (att) {
        await prisma.attendance.update({ where: { id: att.id }, data: { studentCount: count } });
        await replyMessage(replyToken, [{ type: "text", text: `✅ 已記錄 ${dept} 出席 ${count} 人！` }], token);
      } else {
        await replyMessage(replyToken, [{ type: "text", text: `找不到今日課程紀錄，請請管理員先建立出勤紀錄。` }], token);
      }
    } catch (e) {
      console.error("studentCount error:", e);
      await replyMessage(replyToken, [{ type: "text", text: "儲存出席人數時發生錯誤，請稍後再試。" }], token);
    }
    return;
  }

  const upper = text.toUpperCase();

  if (region === "school") {
    // School binding
    const school = await prisma.school.findFirst({ where: { lineBindCode: upper } });
    if (school) {
      await prisma.school.update({ where: { id: school.id }, data: { lineUserId: userId } });
      await replyMessage(replyToken, [{ type: "text", text: `✅ 綁定成功！${school.name} 已連結。之後課程回報會自動發送到這裡。` }], token);
      return;
    }
    await replyMessage(replyToken, [{ type: "text", text: "找不到此綁定碼，請確認後重試，或聯絡管理員。" }], token);
    return;
  }

  // Teacher binding
  const teacher = await prisma.teacher.findFirst({ where: { lineBindCode: upper } });
  if (teacher) {
    await prisma.teacher.update({ where: { id: teacher.id }, data: { lineUserId: userId, lineRegion: region } });
    await replyMessage(replyToken, [{ type: "text", text: `✅ 綁定成功！${teacher.name} 老師，您已連結到${region === "north" ? "北部" : "南部"}系統。` }], token);
    return;
  }

  // Check if already bound teacher
  const bound = await prisma.teacher.findFirst({ where: { lineUserId: userId } });
  if (bound) {
    await replyMessage(replyToken, [{ type: "text", text: `您好，${bound.name} 老師！如需課程回報請等候系統訊息，或聯絡管理員。` }], token);
    return;
  }

  await replyMessage(replyToken, [{ type: "text", text: "請傳送您的綁定碼完成身份驗證，管理員可提供您的綁定碼。" }], token);
}

async function handlePostback(userId: string, data: string, replyToken: string, region: LineRegion, token: string) {
  const params = new URLSearchParams(data);
  const action = params.get("action");
  const attendanceId = Number(params.get("id"));

  if (action === "select_progress") {
    // Look up course type for this attendance record
    const attForCurriculum = await prisma.attendance.findUnique({
      where: { id: attendanceId },
      include: { course: true },
    }) as unknown as { course: { courseType: string } } | null;
    const courseType = attForCurriculum?.course?.courseType ?? "";
    await replyMessage(replyToken, [buildCurriculumSelectMessage(attendanceId, courseType)], token);
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
    }) as unknown as { course: { department: string } } | null;
    const dept = attInfo?.course?.department || "幼兒園";
    await replyMessage(replyToken, [
      { type: "text", text: `✅ 已記錄：【${content}】\n請點選今日出席人數：` },
      buildStudentCountBoard(dept),
    ], token);
    await forwardReportToSchool(attendanceId, token);
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
      }) as unknown as { course: { department: string } } | null;
      const dept = attInfo?.course?.department || "幼兒園";
      await replyMessage(replyToken, [
        { type: "text", text: "✅ 已記錄正常上課！請點選今日出席人數：" },
        buildStudentCountBoard(dept),
      ], token);
      await forwardReportToSchool(attendanceId, token);
    } else {
      // 停課不轉發給園所，只回覆老師
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

async function saveDetailedReport(userId: string, attendanceId: number, text: string, replyToken: string, token: string, region: LineRegion) {
  void region;
  // Strip "自訂：" prefix if present
  const content = text.replace(/^自訂[：:]\s*/, "").trim() || "";

  await prisma.attendance.update({
    where: { id: attendanceId },
    data: { reportContent: content, reportSentAt: new Date() },
  });

  // Look up the course department to send the right number board
  const att = await prisma.attendance.findUnique({
    where: { id: attendanceId },
    include: { course: true },
  }) as unknown as { course: { department: string } } | null;

  const dept = att?.course?.department || "幼兒園";
  const countBoard = buildStudentCountBoard(dept);

  await replyMessage(replyToken, [
    { type: "text", text: `✅ 成功記錄：【${content}】\n🚀 已同步發送綠色圖卡推播給園所！` },
    countBoard,
  ], token);
  await forwardReportToSchool(attendanceId, token);
}

async function forwardReportToSchool(attendanceId: number, _teacherToken: string) {
  const att = await prisma.attendance.findUnique({
    where: { id: attendanceId },
    include: { course: { include: { schoolRel: true } }, actualTeacher: true },
  });
  if (!att) return;

  const school = att.course.schoolRel;
  if (!school?.lineUserId) return;

  const schoolCfg = getLineConfig("school");
  const msg = buildSchoolReportMessage({
    teacherName: att.actualTeacher.name,
    school: att.course.school,
    courseType: att.course.courseType,
    date: att.date.toISOString().slice(0, 10),
    studentCount: att.studentCount,
    content: att.reportContent,
    cancelled: att.cancelled,
  });

  await pushMessage(school.lineUserId, [msg], schoolCfg.token);
  await prisma.attendance.update({ where: { id: attendanceId }, data: { reportSentAt: new Date() } });
}

export { generateBindCode };
