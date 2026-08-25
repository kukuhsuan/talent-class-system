import { NextRequest, NextResponse } from "next/server";
import { createSchoolAttendanceVerification, latestSchoolAttendanceVerification, normalizeVerificationMonths, schoolAttendanceVerificationSummary } from "@/lib/schoolAttendanceVerification";
import { writeAuditLog } from "@/lib/auditLog";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const params = req.nextUrl.searchParams;
    const year = Number(params.get("year"));
    if (!year) throw new Error("缺少年份");
    const months = normalizeVerificationMonths(params.get("months"));
    if (params.get("summary") === "1") {
      return NextResponse.json(await schoolAttendanceVerificationSummary({ year, months }));
    }
    const schoolId = Number(params.get("schoolId"));
    if (!schoolId) throw new Error("缺少園所");
    return NextResponse.json(await latestSchoolAttendanceVerification({ schoolId, year, months }));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "核對狀態讀取失敗" }, { status: 400 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const schoolId = Number(body.schoolId);
    const year = Number(body.year);
    const months = normalizeVerificationMonths(body.months);
    if (!schoolId || !year) throw new Error("缺少園所或年份");
    const result = await createSchoolAttendanceVerification({ schoolId, year, months });
    const url = `${req.nextUrl.origin}/school-attendance-verification/${result.token}`;
    await writeAuditLog(req, {
      action: "create",
      targetType: "SchoolAttendanceVerification",
      targetId: result.row.id,
      targetLabel: `${result.snapshot.schoolName} ${year}/${months.join(",")}`,
      afterData: { schoolId, year, months, classCount: result.snapshot.classCount, totalStudentCount: result.snapshot.totalStudentCount },
      diffSummary: `產生園所人數核對連結：${result.snapshot.schoolName}，${year} 年 ${months.join("、")} 月`,
      sensitive: true,
    });
    return NextResponse.json({ id: result.row.id, url, status: "pending" }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "核對連結產生失敗" }, { status: 400 });
  }
}
