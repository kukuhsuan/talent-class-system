import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { pushMessage } from "@/lib/line";

type DetailRow = {
  date: string; school: string; courseType: string; category: string;
  hours: number; rate: number; travelFee: number; amount: number; isSub: boolean;
};

function buildSalaryText(teacherName: string, year: number, month: number, details: DetailRow[], total: number): string {
  const fmt = (n: number) => n.toLocaleString("zh-TW");
  const fmtDate = (d: string) => {
    const dt = new Date(d);
    return `${dt.getMonth() + 1}/${dt.getDate()}`;
  };

  const lines = [
    `【${teacherName}】${year}年${month}月薪資明細`,
    `─────────────────`,
  ];

  for (const r of details) {
    const sub = r.isSub ? "（代）" : "";
    const travel = r.travelFee > 0 ? `+車${r.travelFee}` : "";
    lines.push(`${fmtDate(r.date)} ${r.school} ${r.courseType}${sub}`);
    lines.push(`  ${r.category} ${r.hours}h × $${r.rate}${travel} = $${fmt(r.amount)}`);
  }

  lines.push(`─────────────────`);
  lines.push(`本月合計：$${fmt(total)}`);

  return lines.join("\n");
}

export async function POST(req: NextRequest) {
  const { teacherId, year, month } = await req.json();

  const start = new Date(Number(year), Number(month) - 1, 1);
  const end = new Date(Number(year), Number(month), 1);

  const teacher = await prisma.teacher.findUnique({ where: { id: Number(teacherId) } }) as unknown as {
    id: number; name: string; lineUserId: string | null; lineRegion: string;
    rateAfterSchool: number; rateDemo: number; travelFee: number;
  } | null;

  if (!teacher) return NextResponse.json({ error: "Teacher not found" }, { status: 404 });
  if (!teacher.lineUserId) return NextResponse.json({ error: "老師尚未綁定 LINE" }, { status: 400 });

  const attendances = await prisma.attendance.findMany({
    where: { actualTeacherId: teacher.id, cancelled: false, date: { gte: start, lt: end } },
    include: { course: true },
    orderBy: { date: "asc" },
  }) as unknown as Array<{
    id: number; date: Date; hours: number; category: string; notes: string;
    course: { school: string; courseType: string; teacherId: number };
  }>;

  const details: DetailRow[] = attendances.map((a) => {
    const isDemo = a.category === "Demo" || a.category === "試上";
    const rate = isDemo ? teacher.rateDemo : teacher.rateAfterSchool;
    const travelFee = isDemo ? 0 : teacher.travelFee;
    const amount = a.hours * rate + travelFee;
    return {
      date: a.date.toISOString(),
      school: a.course.school,
      courseType: a.course.courseType,
      category: a.category,
      hours: a.hours,
      rate,
      travelFee,
      amount,
      isSub: a.course.teacherId !== teacher.id,
    };
  });

  const total = details.reduce((s, r) => s + r.amount, 0);
  const text = buildSalaryText(teacher.name, Number(year), Number(month), details, total);

  const region = teacher.lineRegion || "north";
  const token = region === "south" ? process.env.LINE_SOUTH_TOKEN! : process.env.LINE_NORTH_TOKEN!;

  await pushMessage(teacher.lineUserId, [{ type: "text", text }], token);

  return NextResponse.json({ ok: true, sent: teacher.name });
}
