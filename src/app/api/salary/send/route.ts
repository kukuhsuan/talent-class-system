import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { courseLabel, pushMessage } from "@/lib/line";
import { normalizeCategory } from "@/lib/courseMeta";

type DetailRow = {
  date: string; school: string; courseType: string; category: string;
  hours: number; rate: number; travelFee: number; amount: number; isSub: boolean; role?: string;
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
        text: `${r.category} ${r.hours}h × $${fmt(r.rate)}${r.travelFee > 0 ? ` + 車馬 $${fmt(r.travelFee)}` : ""} = $${fmt(r.amount)}`,
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

  const start = new Date(Number(year), Number(month) - 1, 1);
  const end = new Date(Number(year), Number(month), 1);

  const teacher = await prisma.teacher.findUnique({ where: { id: Number(teacherId) } }) as unknown as {
    id: number; name: string; lineUserId: string | null; lineRegion: string;
    rateAfterSchool: number; rateInSchool: number; rateDemo: number; travelFee: number; isAssistant: boolean; assistantFee: number;
  } | null;

  if (!teacher) return NextResponse.json({ error: "Teacher not found" }, { status: 404 });
  if (!teacher.lineUserId) return NextResponse.json({ error: "老師尚未綁定 LINE" }, { status: 400 });

  const attendances = await prisma.attendance.findMany({
    where: { OR: [{ actualTeacherId: teacher.id }, { assistantTeacherId: teacher.id }], cancelled: false, date: { gte: start, lt: end } },
    include: { course: true },
    orderBy: { date: "asc" },
  }) as unknown as Array<{
    id: number; date: Date; hours: number; category: string; notes: string; actualTeacherId: number; assistantTeacherId?: number | null;
    course: { school: string; courseType: string; teacherId: number };
  }>;

  const details: DetailRow[] = attendances.map((a) => {
    const category = normalizeCategory(a.category);
    const isDemo = category === "Demo";
    const role = a.assistantTeacherId === teacher.id ? "助教" : "主教";
    const rate = role === "助教" ? teacher.assistantFee : isDemo ? teacher.rateDemo : category === "課內" ? teacher.rateInSchool : teacher.rateAfterSchool;
    const travelFee = role === "助教" || isDemo ? 0 : teacher.travelFee;
    const amount = a.hours * rate + travelFee;
    return {
      date: a.date.toISOString(),
      school: a.course.school,
      courseType: a.course.courseType,
      category,
      hours: a.hours,
      rate,
      travelFee,
      amount,
      isSub: role === "主教" && a.course.teacherId !== teacher.id,
      role,
    };
  });

  const total = details.reduce((s, r) => s + r.amount, 0);
  const message = buildTeachingFeeMessage(teacher.name, Number(year), Number(month), details, total);

  const region = teacher.lineRegion || "north";
  const token = region === "south" ? process.env.LINE_SOUTH_TOKEN! : process.env.LINE_NORTH_TOKEN!;

  await pushMessage(teacher.lineUserId, [message], token);

  return NextResponse.json({ ok: true, sent: teacher.name });
}
