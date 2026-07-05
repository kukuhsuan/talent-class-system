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

function buildTeachingFeeMessage(teacherName: string, year: number, month: number, details: DetailRow[], total: number): object {
  const fmt = (n: number) => n.toLocaleString("zh-TW");
  const fmtDate = (d: string) => {
    const dt = new Date(d);
    return `${dt.getMonth() + 1}/${dt.getDate()}`;
  };

  const rows = details.slice(0, 20).map((r) => ({
    type: "box",
    layout: "vertical",
    spacing: "xs",
    paddingTop: "8px",
    paddingBottom: "8px",
    contents: [
      {
        type: "text",
        text: `${fmtDate(r.date)} ${r.school}｜${courseLabel(r.courseType)}${r.isSub ? "（代課）" : ""}${r.role === "助教" ? "（助教）" : ""}`,
        size: "sm",
        color: "#2E2B27",
        weight: "bold",
        wrap: true,
      },
      {
        type: "text",
        text: r.hoursNeedsReview
          ? `${r.category}｜${r.time || r.hoursReviewReason}｜時數需人工確認`
          : `${r.category} ${r.hours}h × $${fmt(r.rate)}${r.travelFee > 0 ? ` + 車馬 $${fmt(r.travelFee)}` : ""} = $${fmt(r.amount)}`,
        size: "xs",
        color: "#7C7167",
        wrap: true,
      },
    ],
  }));

  return {
    type: "flex",
    altText: `【${teacherName}】${year}年${month}月教學費用明細`,
    contents: {
      type: "bubble",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#7B9E87",
        paddingAll: "16px",
        contents: [
          { type: "text", text: "教學費用明細", color: "#F6F3EE", weight: "bold", size: "lg" },
          { type: "text", text: `【${teacherName}】${year}年${month}月`, color: "#DDD8D0", size: "sm", margin: "xs" },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#F6F3EE",
        paddingAll: "14px",
        spacing: "none",
        contents: rows.length > 0
          ? rows
          : [{ type: "text", text: "本月沒有可計算的上課紀錄", size: "sm", color: "#7C7167", align: "center" as const }],
      },
      footer: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#EFE6DA",
        paddingAll: "14px",
        contents: [
          { type: "text", text: `本月合計：$${fmt(total)}`, size: "lg", weight: "bold", color: "#5C4636", align: "end" as const },
          ...(details.length > 20 ? [{ type: "text", text: `另有 ${details.length - 20} 筆，請至系統查看完整明細`, size: "xxs", color: "#9A9088", align: "end" as const, margin: "xs" }] : []),
        ],
      },
    },
  };
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
  const message = buildTeachingFeeMessage(teacher.name, Number(year), Number(month), details, total);

  const region = teacher.lineRegion || "north";
  const token = region === "south" ? process.env.LINE_SOUTH_TOKEN! : process.env.LINE_NORTH_TOKEN!;

  await pushMessage(teacher.lineUserId, [message], token);

  return NextResponse.json({ ok: true, sent: teacher.name });
}
