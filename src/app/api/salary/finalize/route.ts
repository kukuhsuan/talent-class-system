import { NextRequest, NextResponse } from "next/server";
import { OWNER_ROLES, SALARY_ROLES, requireRole } from "@/lib/permissions";
import { writeAuditLog } from "@/lib/auditLog";
import { finalizePayrollMonth, unlockPayrollMonth } from "@/lib/payrollRun";

export async function POST(req: NextRequest) {
  try {
    const data = await req.json();
    const year = Number(data.year);
    const month = Number(data.month);
    const action = String(data.action ?? "lock");
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
      return NextResponse.json({ error: "年月格式錯誤" }, { status: 400 });
    }

    if (action === "unlock") {
      // 解鎖會讓歷史薪資恢復即時重算，僅最高權限可執行
      const auth = await requireRole(OWNER_ROLES);
      if (auth.response) return auth.response;
      const result = await unlockPayrollMonth(year, month);
      await writeAuditLog(req, {
        action: "unlock",
        targetType: "PayrollRun",
        targetId: `${year}-${String(month).padStart(2, "0")}`,
        targetLabel: `${year}年${month}月薪資結算`,
        beforeData: { finalizedBy: result.previousRun.finalizedBy, finalizedAt: result.previousRun.finalizedAt },
        diffSummary: `解鎖 ${year}年${month}月薪資結算（${result.unlockedAttendances} 筆出勤恢復可編輯，薪資恢復即時重算）`,
        sensitive: true,
      });
      return NextResponse.json({ ok: true, ...result });
    }

    const auth = await requireRole(SALARY_ROLES);
    if (auth.response) return auth.response;
    const result = await finalizePayrollMonth(year, month, auth.user?.name ?? "");
    await writeAuditLog(req, {
      action: "lock",
      targetType: "PayrollRun",
      targetId: `${year}-${String(month).padStart(2, "0")}`,
      targetLabel: `${year}年${month}月薪資結算`,
      diffSummary: `結算鎖定 ${year}年${month}月薪資（快照 ${result.teacherCount} 位老師、鎖定 ${result.lockedAttendances} 筆出勤）`,
      sensitive: true,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message || "薪資結算操作失敗" }, { status: 400 });
  }
}
