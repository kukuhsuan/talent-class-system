import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { SENSITIVE_FINANCE_ROLES, requireRole, sameOriginOk } from "@/lib/permissions";
import { ensureTeacherExtendedColumns } from "@/lib/teacherColumns";
import { writeAuditLog } from "@/lib/auditLog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CONFIRM = "mark-bank-held-offline";

// 「匯款資料在會計端」的批次註記。
// 系統上線前就在匯款的老師，帳號與存摺一直在會計手上，系統沒有也不需要有；
// 沒有這個註記，這些人每個月都會被當成「缺少銀行帳號」擋下來，紅字久了就沒人看。
// 註記等於會計出面背書，所以一定連「誰、什麼時候、依據哪份名單」一起寫進去。

function parseNames(value: unknown) {
  return String(value ?? "")
    .split(/[\n,，、;；\t]/)
    .map((name) => name.trim())
    .filter(Boolean);
}

type Matched = {
  teacherId: number;
  name: string;
  hasBankInSystem: boolean;
  alreadyMarked: boolean;
  markedBy: string;
  markedAt: string;
};

async function match(names: string[]) {
  await ensureTeacherExtendedColumns();
  const unique = Array.from(new Set(names));
  const teachers = await prisma.teacher.findMany({
    where: { name: { in: unique } },
    select: {
      id: true, name: true, bankName: true, bankAccountNumber: true, bankAccountName: true,
      bankHeldOfflineAt: true, bankHeldOfflineBy: true,
    },
  });

  const byName = new Map(teachers.map((teacher) => [teacher.name, teacher]));
  const matched: Matched[] = [];
  const unmatched: string[] = [];
  for (const name of unique) {
    const teacher = byName.get(name);
    if (!teacher) {
      unmatched.push(name);
      continue;
    }
    matched.push({
      teacherId: teacher.id,
      name: teacher.name,
      hasBankInSystem: Boolean(
        teacher.bankName?.trim() && teacher.bankAccountNumber?.trim() && teacher.bankAccountName?.trim(),
      ),
      alreadyMarked: Boolean(teacher.bankHeldOfflineAt),
      markedBy: teacher.bankHeldOfflineBy ?? "",
      markedAt: teacher.bankHeldOfflineAt ? teacher.bankHeldOfflineAt.toISOString() : "",
    });
  }
  return { inputCount: unique.length, matched, unmatched };
}

// 試算：先讓會計看清楚誰對得上、誰對不上（打錯字或還沒建檔的人不能默默略過）
export async function POST(req: NextRequest) {
  const { user, response } = await requireRole(SENSITIVE_FINANCE_ROLES);
  if (response) return response;
  if (!sameOriginOk(req)) return NextResponse.json({ error: "來源不合法" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const names = parseNames(body?.names);
  const note = String(body?.note ?? "").trim().slice(0, 200);
  if (names.length === 0) return NextResponse.json({ error: "請貼上至少一個老師姓名" }, { status: 400 });

  const result = await match(names);

  if (body?.confirm !== CONFIRM) {
    return NextResponse.json({ mode: "dry-run", note: "此為試算結果，尚未寫入資料庫。", ...result });
  }

  const picked = Array.isArray(body?.teacherIds) && body.teacherIds.length > 0
    ? new Set(body.teacherIds.map(Number))
    : null;
  const targets = result.matched.filter((row) => !picked || picked.has(row.teacherId));
  if (targets.length === 0) return NextResponse.json({ error: "沒有可註記的老師" }, { status: 400 });

  const actor = user?.name || user?.username || "";
  const now = new Date();
  await prisma.teacher.updateMany({
    where: { id: { in: targets.map((row) => row.teacherId) } },
    data: { bankHeldOfflineAt: now, bankHeldOfflineBy: actor, bankHeldOfflineNote: note },
  });

  await writeAuditLog(req, {
    action: "update",
    targetType: "Teacher",
    targetLabel: "註記匯款資料在會計端",
    diffSummary: `註記「匯款資料在會計端」${targets.length} 位${note ? `（依據：${note}）` : ""}：${targets.slice(0, 15).map((row) => row.name).join("、")}${targets.length > 15 ? " 等" : ""}`,
    afterData: targets.map((row) => ({ teacherId: row.teacherId, name: row.name })),
    sensitive: true,
  });

  return NextResponse.json({
    mode: "executed",
    markedCount: targets.length,
    markedBy: actor,
    unmatched: result.unmatched,
  });
}

// 取消註記：老師的帳號改由系統控管（或當初標錯人）時使用
export async function DELETE(req: NextRequest) {
  const { user, response } = await requireRole(SENSITIVE_FINANCE_ROLES);
  if (response) return response;
  if (!sameOriginOk(req)) return NextResponse.json({ error: "來源不合法" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const teacherIds = Array.isArray(body?.teacherIds) ? body.teacherIds.map(Number).filter(Number.isFinite) : [];
  if (teacherIds.length === 0) return NextResponse.json({ error: "請選擇要取消註記的老師" }, { status: 400 });

  await ensureTeacherExtendedColumns();
  const teachers = await prisma.teacher.findMany({
    where: { id: { in: teacherIds }, NOT: { bankHeldOfflineAt: null } },
    select: { id: true, name: true },
  });
  if (teachers.length === 0) return NextResponse.json({ error: "這些老師沒有註記可取消" }, { status: 404 });

  await prisma.teacher.updateMany({
    where: { id: { in: teachers.map((teacher) => teacher.id) } },
    data: { bankHeldOfflineAt: null, bankHeldOfflineBy: "", bankHeldOfflineNote: "" },
  });

  await writeAuditLog(req, {
    action: "update",
    targetType: "Teacher",
    targetLabel: "取消「匯款資料在會計端」註記",
    diffSummary: `取消註記 ${teachers.length} 位（操作者 ${user?.name || user?.username || ""}）：${teachers.slice(0, 15).map((teacher) => teacher.name).join("、")}${teachers.length > 15 ? " 等" : ""}`,
    sensitive: true,
  });

  return NextResponse.json({ ok: true, clearedCount: teachers.length });
}
