import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendMail } from "@/lib/mailer";
import { courseLabel } from "@/lib/courseMeta";
import { calculateSalaryMonth } from "@/lib/salaryCalculation";
import { isWaitingTeacherName } from "@/lib/teacherAssignment";

type DetailRow = {
  date: Date; school: string; courseType: string; category: string;
  hours: number; time: string; hoursNeedsReview: boolean; hoursReviewReason: string;
  rate: number; travelFee: number; amount: number; isSub: boolean; role?: string;
};

function buildHtml(teacherName: string, year: number, month: number, details: DetailRow[], total: number): string {
  const fmt = (n: number) => n.toLocaleString("zh-TW");
  const fmtDate = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`;

  const rows = details.map((r) => `
    <tr>
      <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;">${fmtDate(r.date)}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;font-weight:500;">${r.school}${r.isSub ? ' <span style="color:#f97316;font-size:12px">代</span>' : ""}${r.role === "助教" ? ' <span style="color:#2563eb;font-size:12px">助教</span>' : ""}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;">${courseLabel(r.courseType)}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;text-align:center;">${r.category}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;text-align:center;">${r.hoursNeedsReview ? `需人工確認<br><span style="color:#ef4444;font-size:11px">${r.time || r.hoursReviewReason}</span>` : `${r.hours}`}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;text-align:right;">$${r.rate}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;text-align:right;">${r.travelFee > 0 ? `$${r.travelFee}` : "—"}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:500;">$${fmt(r.amount)}</td>
    </tr>`).join("");

  return `
<!DOCTYPE html>
<html lang="zh-TW">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="font-family:Arial,sans-serif;background:#f8fafc;margin:0;padding:20px;">
  <div style="max-width:680px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.1);">
    <div style="background:#1e3a8a;padding:24px 28px;">
      <h1 style="color:#fff;margin:0;font-size:20px;">【${teacherName}】${year}年${month}月薪資明細單</h1>
      <p style="color:#93c5fd;margin:6px 0 0;font-size:14px;">WaysLeader AI 幼兒園學習成果平台</p>
    </div>
    <div style="padding:24px 28px;">
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <thead>
          <tr style="background:#f1f5f9;">
            <th style="padding:8px 10px;text-align:left;font-weight:600;color:#475569;">日期</th>
            <th style="padding:8px 10px;text-align:left;font-weight:600;color:#475569;">學校</th>
            <th style="padding:8px 10px;text-align:left;font-weight:600;color:#475569;">項目</th>
            <th style="padding:8px 10px;text-align:center;font-weight:600;color:#475569;">類別</th>
            <th style="padding:8px 10px;text-align:center;font-weight:600;color:#475569;">計薪時數</th>
            <th style="padding:8px 10px;text-align:right;font-weight:600;color:#475569;">時薪</th>
            <th style="padding:8px 10px;text-align:right;font-weight:600;color:#475569;">車費</th>
            <th style="padding:8px 10px;text-align:right;font-weight:600;color:#475569;">金額</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
        <tfoot>
          <tr style="background:#eff6ff;">
            <td colspan="7" style="padding:10px;text-align:right;font-weight:700;color:#1e40af;font-size:15px;">本月合計</td>
            <td style="padding:10px;text-align:right;font-weight:700;color:#1e40af;font-size:16px;">$${fmt(total)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
    <div style="padding:16px 28px;background:#f8fafc;border-top:1px solid #e2e8f0;">
      <p style="margin:0;font-size:12px;color:#94a3b8;">此信件由 WaysLeader AI 自動寄送，如有疑問請聯絡平台窗口。</p>
    </div>
  </div>
</body>
</html>`;
}

export async function POST(req: NextRequest) {
  const { teacherId, year, month } = await req.json();

  const teacher = await prisma.teacher.findUnique({ where: { id: Number(teacherId) } }) as unknown as {
    id: number; name: string; email: string;
    rateAfterSchool: number; rateInSchool: number; rateDemo: number; travelFee: number; isAssistant: boolean; assistantFee: number;
  } | null;

  if (!teacher) return NextResponse.json({ error: "Teacher not found" }, { status: 404 });
  if (isWaitingTeacherName(teacher.name)) return NextResponse.json({ error: "待排老師為系統佔位資料，不能寄送薪資" }, { status: 400 });
  if (!teacher.email) return NextResponse.json({ error: "老師尚未設定 Email" }, { status: 400 });

  const salary = await calculateSalaryMonth(Number(year), Number(month), { teacherId: teacher.id, includeDetails: true });
  const result = salary.results[0];
  const details: DetailRow[] = [
    ...(result?.details ?? []),
    ...(result?.adjustments ?? []).map((item) => ({
      date: new Date(Number(year), Number(month) - 1, 1), school: item.reason,
      courseType: item.type, category: "薪資調整", hours: 1, time: `歸屬 ${item.targetMonth}`,
      hoursNeedsReview: false, hoursReviewReason: "", rate: item.amount, travelFee: 0,
      amount: item.amount, isSub: false,
    })),
  ];
  const total = result?.total ?? 0;
  const html = buildHtml(teacher.name, Number(year), Number(month), details, total);
  const subject = `【${teacher.name}】${year}年${month}月薪資明細單`;

  await sendMail(teacher.email, subject, html);

  return NextResponse.json({ ok: true, sent: teacher.email });
}
