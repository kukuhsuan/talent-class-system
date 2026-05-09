import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { Teacher } from "@prisma/client";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const year = Number(searchParams.get("year") ?? new Date().getFullYear());
  const month = Number(searchParams.get("month") ?? new Date().getMonth() + 1);

  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 1);

  const [teachers, attendances] = await Promise.all([
    prisma.teacher.findMany({ orderBy: { name: "asc" } }),
    prisma.attendance.findMany({
      where: { date: { gte: start, lt: end } },
      include: { course: true, actualTeacher: true },
    }),
  ]);

  const results = teachers.map((teacher: Teacher) => {
    const myRecords = attendances.filter(
      (a) => a.actualTeacherId === teacher.id && !a.cancelled
    );

    const regularRecords = myRecords.filter(
      (a) => a.category !== "Demo" && a.category !== "試上"
    );
    const demoRecords = myRecords.filter(
      (a) => a.category === "Demo" || a.category === "試上"
    );
    const subRecords = regularRecords.filter(
      (a) => a.course.teacherId !== teacher.id
    );

    const regularHours = regularRecords.reduce((s, a) => s + a.hours, 0);
    const demoHours = demoRecords.reduce((s, a) => s + a.hours, 0);
    const subHours = subRecords.reduce((s, a) => s + a.hours, 0);

    const regularPay = regularHours * teacher.rateAfterSchool;
    const demoPay = demoHours * teacher.rateDemo;
    const travelPay = (regularHours + demoHours) * teacher.travelFee;
    const total = regularPay + demoPay + travelPay;

    return {
      teacher,
      regularHours,
      subHours,
      demoHours,
      regularPay,
      demoPay,
      travelPay,
      total,
      hasActivity: myRecords.length > 0,
    };
  });

  return NextResponse.json({ year, month, results });
}
