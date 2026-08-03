import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { courseLabel, pushMessage } from "@/lib/line";
import { calculateSalaryMonth } from "@/lib/salaryCalculation";
import { isWaitingTeacherName } from "@/lib/teacherAssignment";

type DetailRow = {
  date: string; school: string; courseType: string; category: string;
  hours: number; time: string; hoursNeedsReview: boolean; hoursReviewReason: string;
  rate: number; travelFee: number; amount: number; isSub: boolean; role?: string;
};

function buildTeachingFeeMessages(teacherName: string, year: number, month: number, details: DetailRow[], total: number): object[] {
  const fmt = (n: number) => n.toLocaleString("zh-TW");
  const fmtDate = (d: string) => {
    const dt = new Date(d);
    return `${dt.getMonth() + 1}/${dt.getDate()}`;
  };
  // LINE 每次 push 最多 5 則訊息；每頁控制 15 筆，避免單一 Flex JSON 過大。
  // 超過一頁時由呼叫端分批推送，但不省略任何課程。
  const pageSize = 15;
  const pages: DetailRow[][] = details.length > 0
    ? Array.from({ length: Math.ceil(details.length / pageSize) }, (_, index) => details.slice(index * pageSize, (index + 1) * pageSize))
    : [[]];

  return pages.map((page, pageIndex) => {
    const rows = page.map((r) => ({
      type: "box",
      layout: "vertical",
      spacing: "xs",
      backgroundColor: "#FFFFFF",
      cornerRadius: "10px",
      paddingAll: "12px",
      margin: "sm",
      contents: [
        {
          type: "text",
          text: `${fmtDate(r.date)} ${r.school}｜${courseLabel(r.courseType)}${r.isSub ? "（代課）" : ""}${r.role === "助教" ? "（助教）" : ""}`,
          size: "sm",
          color: "#102A43",
          weight: "bold",
          wrap: true,
        },
        {
          type: "text",
          text: r.hoursNeedsReview
            ? `${r.category}｜${r.time || r.hoursReviewReason}｜時數需人工確認`
            : `${r.category} ${r.hours}h × $${fmt(r.rate)}${r.travelFee > 0 ? ` + 車馬 $${fmt(r.travelFee)}` : ""} = $${fmt(r.amount)}`,
          size: "xs",
          color: r.hoursNeedsReview ? "#C05621" : "#486581",
          wrap: true,
        },
      ],
    }));

    return {
    type: "flex",
    altText: `【${teacherName}】${year}年${month}月教學費用明細${pages.length > 1 ? `（${pageIndex + 1}/${pages.length}）` : ""}`,
    contents: {
      type: "bubble",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#2F80C9",
        paddingAll: "18px",
        contents: [
          { type: "text", text: "教學費用明細", color: "#FFFFFF", weight: "bold", size: "xl" },
          { type: "text", text: `${teacherName} 老師｜${year} 年 ${month} 月${pages.length > 1 ? `｜第 ${pageIndex + 1}/${pages.length} 頁` : ""}`, color: "#DCEEFF", size: "sm", margin: "sm" },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#F7FBFF",
        paddingAll: "10px",
        spacing: "none",
        contents: rows.length > 0
          ? rows
          : [{
              type: "box",
              layout: "vertical",
              backgroundColor: "#FFFFFF",
              cornerRadius: "10px",
              paddingAll: "16px",
              contents: [
                { type: "text", text: "本月沒有可計算的上課紀錄", size: "sm", color: "#486581", align: "center" as const },
              ],
            }],
      },
      footer: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#EAF4FF",
        paddingAll: "16px",
        contents: [
          { type: "text", text: "本月教學費用合計", size: "xs", color: "#486581", align: "end" as const },
          { type: "text", text: `$${fmt(total)}`, size: "xxl", weight: "bold", color: "#1769AA", align: "end" as const, margin: "xs" },
          ...(pages.length > 1 ? [{ type: "text", text: `本頁 ${page.length} 筆｜全部共 ${details.length} 筆`, size: "xxs", color: "#6B7C93", align: "end" as const, margin: "sm" }] : []),
        ],
      },
    },
    };
  });
}

export async function POST(req: NextRequest) {
  const { teacherId, year, month } = await req.json();

  const teacher = await prisma.teacher.findUnique({ where: { id: Number(teacherId) } }) as unknown as {
    id: number; name: string; lineUserId: string | null; lineRegion: string;
    rateAfterSchool: number; rateInSchool: number; rateDemo: number; travelFee: number; isAssistant: boolean; assistantFee: number;
  } | null;

  if (!teacher) return NextResponse.json({ error: "Teacher not found" }, { status: 404 });
  if (isWaitingTeacherName(teacher.name)) return NextResponse.json({ error: "待排老師為系統佔位資料，不能傳送薪資" }, { status: 400 });
  if (!teacher.lineUserId) return NextResponse.json({ error: "老師尚未綁定 LINE" }, { status: 400 });

  const salary = await calculateSalaryMonth(Number(year), Number(month), { teacherId: teacher.id, includeDetails: true });
  const result = salary.results[0];
  const details: DetailRow[] = [
    ...(result?.details ?? []).map((item) => ({ ...item, date: item.date.toISOString() })),
    ...(result?.adjustments ?? []).map((item) => ({
      date: new Date(Number(year), Number(month) - 1, 1).toISOString(), school: item.reason,
      courseType: item.type, category: "薪資調整", hours: 1, time: `歸屬 ${item.targetMonth}`,
      hoursNeedsReview: false, hoursReviewReason: "", rate: item.amount, travelFee: 0,
      amount: item.amount, isSub: false,
    })),
  ];
  const total = result?.total ?? 0;
  const messages = buildTeachingFeeMessages(teacher.name, Number(year), Number(month), details, total);

  const region = teacher.lineRegion || "north";
  const token = region === "south" ? process.env.LINE_SOUTH_TOKEN! : process.env.LINE_NORTH_TOKEN!;

  // LINE 單次最多接受 5 則訊息；分批送出，確保所有課程明細都會傳到。
  for (let index = 0; index < messages.length; index += 5) {
    await pushMessage(teacher.lineUserId, messages.slice(index, index + 5), token);
  }

  return NextResponse.json({ ok: true, sent: teacher.name, detailCount: details.length, messageCount: messages.length });
}
