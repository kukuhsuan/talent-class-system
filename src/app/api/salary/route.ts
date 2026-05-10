import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const year = Number(searchParams.get("year") ?? new Date().getFullYear());
  const month = Number(searchParams.get("month") ?? new Date().getMonth() + 1);

  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 1);

  const [teachers, attendancesRaw] = await Promise.all([
    prisma.teacher.findMany({ orderBy: { name: "asc" } }),
    prisma.attendance.findMany({
      where: { date: { gte: start, lt: end }, cancelled: false },
      include: { course: true, actualTeacher: true },
      orderBy: { date: "asc" },
    }),
  ]);

  const results = teachers.map((teacher: Record<string, unknown>) => {
    const t = teacher as { id: number; name: string; rateAfterSchool: number; rateInSchool: number; rateDemo: number; travelFee: number };
    const myRecords = (attendancesRaw as unknown as Array<{
      id: number; date: Date; actualTeacherId: number; category: string; hours: number; notes: string;
      course: { id: number; school: string; courseType: string; teacherId: number; category: string; department: string };
      actualTeacher: { name: string };
    }>).filter((a) => a.actualTeacherId === t.id);

    const details = myRecords.map((a) => {
      const isDemo = a.category === "Demo" || a.category === "試上";
      const rate = isDemo ? t.rateDemo : t.rateAfterSchool;
      const amount = a.hours * rate + (isDemo ? 0 : t.travelFee);
      return {
        id: a.id,
        date: a.date,
        school: a.course.school,
        courseType: a.course.courseType,
        category: a.category,
        hours: a.hours,
        rate,
        travelFee: isDemo ? 0 : t.travelFee,
        amount,
        isSub: a.course.teacherId !== t.id,
        department: a.course.department ?? "",
        notes: a.notes,
      };
    });

    const regularHours = myRecords.filter((a) => a.category !== "Demo" && a.category !== "試上").reduce((s, a) => s + a.hours, 0);
    const demoHours = myRecords.filter((a) => a.category === "Demo" || a.category === "試上").reduce((s, a) => s + a.hours, 0);
    const subHours = myRecords.filter((a) => a.course.teacherId !== t.id && a.category !== "Demo" && a.category !== "試上").reduce((s, a) => s + a.hours, 0);
    const regularPay = regularHours * t.rateAfterSchool;
    const demoPay = demoHours * t.rateDemo;
    const travelPay = (regularHours + demoHours) * t.travelFee;
    const total = regularPay + demoPay + travelPay;

    return { teacher: t, regularHours, subHours, demoHours, regularPay, demoPay, travelPay, total, hasActivity: myRecords.length > 0, details };
  });

  return NextResponse.json({ year, month, results });
}
