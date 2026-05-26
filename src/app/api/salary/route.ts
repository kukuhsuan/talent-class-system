import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizeCategory } from "@/lib/courseMeta";

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
      include: { course: true, actualTeacher: true, assistantTeacher: true },
      orderBy: { date: "asc" },
    }),
  ]);

  type AttendanceRow = {
    id: number; date: Date; actualTeacherId: number; assistantTeacherId?: number | null; category: string; hours: number; notes: string;
    course: { id: number; school: string; courseType: string; teacherId: number; category: string; department: string };
    actualTeacher: { name: string };
  };

  function buildDetail(a: AttendanceRow, t: { id: number; rateAfterSchool: number; rateInSchool: number; rateDemo: number; travelFee: number; isAssistant: boolean; assistantFee: number }, role: "主教" | "助教") {
    const category = normalizeCategory(a.category);
    const isDemo = category === "Demo";
    const rate = role === "助教" ? t.assistantFee : isDemo ? t.rateDemo : category === "課內" ? t.rateInSchool : t.rateAfterSchool;
    const travelFee = role === "助教" || isDemo ? 0 : t.travelFee;
    const amount = a.hours * rate + travelFee;
    return {
      id: role === "助教" ? -a.id : a.id,
      date: a.date,
      school: a.course.school,
      courseType: a.course.courseType,
      category,
      hours: a.hours,
      rate,
      travelFee,
      amount,
      isSub: role === "主教" && a.course.teacherId !== t.id,
      role,
      department: a.course.department ?? "",
      notes: a.notes,
    };
  }

  const results = teachers.map((teacher: Record<string, unknown>) => {
    const t = teacher as { id: number; name: string; rateAfterSchool: number; rateInSchool: number; rateDemo: number; travelFee: number; isAssistant: boolean; assistantFee: number };
    const rows = attendancesRaw as unknown as AttendanceRow[];
    const leadRecords = rows.filter((a) => a.actualTeacherId === t.id);
    const assistantRecords = rows.filter((a) => a.assistantTeacherId === t.id);
    const details = [
      ...leadRecords.map((a) => buildDetail(a, t, "主教")),
      ...assistantRecords.map((a) => buildDetail(a, t, "助教")),
    ].sort((a, b) => a.date.getTime() - b.date.getTime());

    const regularHours = leadRecords.filter((a) => normalizeCategory(a.category) !== "Demo").reduce((s, a) => s + a.hours, 0);
    const demoHours = leadRecords.filter((a) => normalizeCategory(a.category) === "Demo").reduce((s, a) => s + a.hours, 0);
    const assistantHours = assistantRecords.reduce((s, a) => s + a.hours, 0);
    const subHours = leadRecords.filter((a) => a.course.teacherId !== t.id && normalizeCategory(a.category) !== "Demo").reduce((s, a) => s + a.hours, 0);
    const regularPay = leadRecords.filter((a) => normalizeCategory(a.category) !== "Demo").reduce((s, a) => {
      const category = normalizeCategory(a.category);
      return s + a.hours * (category === "課內" ? t.rateInSchool : t.rateAfterSchool);
    }, 0);
    const demoPay = demoHours * t.rateDemo;
    const assistantPay = assistantRecords.reduce((s, a) => s + a.hours * t.assistantFee, 0);
    const travelPay = regularHours * t.travelFee;
    const total = regularPay + demoPay + assistantPay + travelPay;

    return { teacher: t, regularHours, subHours, demoHours, assistantHours, regularPay, demoPay, assistantPay, travelPay, total, hasActivity: leadRecords.length + assistantRecords.length > 0, details };
  });

  return NextResponse.json({ year, month, results });
}
