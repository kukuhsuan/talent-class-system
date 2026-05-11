import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  LineRegion, getLineConfig, verifyLineSignature,
  replyMessage, pushMessage,
  buildReportRequestMessage, buildSchoolReportMessage, buildStudentCountBoard, generateBindCode,
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
    await replyMessage(replyToken, [{
      type: "text",
      text: "歡迎！請傳送您的園所綁定碼（6位英數字），即可開始接收課程回報。",
    }], token);
  } else {
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

  // Parse student count report: "幼兒園 16", "國小 12", "安親 8"
  const countMatch = text.match(/^(幼兒園|國小|安親)\s+(\d+)$/);
  if (countMatch) {
    const dept = countMatch[1];
    const count = parseInt(countMatch[2]);
    const bound2 = await (prisma.teacher as unknown as { findFirst: (q: object) => Promise<{ id: number; name: string } | null> }).findFirst({ where: { lineUserId: userId } });
    if (bound2) {
      const today = new Date();
      const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const end = new Date(start.getTime() + 86400000);
      const att = await prisma.attendance.findFirst({
        where: { actualTeacherId: bound2.id, date: { gte: start, lt: end }, cancelled: false, studentCount: null,
          course: { department: dept } },
        orderBy: { id: "desc" },
      });
      if (att) {
        await prisma.attendance.update({ where: { id: att.id }, data: { studentCount: count } });
        await replyMessage(replyToken, [{ type: "text", text: `✅ 已記錄 ${dept} 出席 ${count} 人！` }], token);
      } else {
        await replyMessage(replyToken, [{ type: "text", text: `找不到今日 ${dept} 待填課程，出席人數未記錄。` }], token);
      }
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

  if (action === "report") {
    const status = params.get("status");
    const cancelled = status === "cancelled";

    await prisma.attendance.update({
      where: { id: attendanceId },
      data: { cancelled, reportContent: cancelled ? "停課" : "正常上課", reportSentAt: new Date() },
    });

    if (!cancelled) {
      // Look up course department for the number board
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
      await replyMessage(replyToken, [{ type: "text", text: "已記錄停課，謝謝回報！" }], token);
      await forwardReportToSchool(attendanceId, token);
    }
    return;
  }

  if (action === "report_detail") {
    pendingDetails.set(userId, attendanceId);
    await replyMessage(replyToken, [{
      type: "text",
      text: "請輸入課程回報（例如：出席15人，教了跳繩和基本動作，孩子很投入）：",
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
