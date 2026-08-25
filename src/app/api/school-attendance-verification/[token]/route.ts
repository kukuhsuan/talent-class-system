import { NextRequest, NextResponse } from "next/server";
import { submitSchoolAttendanceVerification, verificationByToken } from "@/lib/schoolAttendanceVerification";
import { writeAuditLog } from "@/lib/auditLog";

export const dynamic = "force-dynamic";

function safePublicError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : "";
  const expected = ["核對連結", "請填寫", "請簡單說明", "課程人數剛剛有更新"];
  if (expected.some((prefix) => message.startsWith(prefix))) return message;
  console.error("School attendance verification failed", error);
  return fallback;
}

export async function GET(_req: NextRequest, context: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await context.params;
    const result = await verificationByToken(token);
    return NextResponse.json({
      snapshot: result.currentSnapshot,
      snapshotHash: result.currentHash,
      status: result.stale && result.row.status === "confirmed" ? "stale" : result.row.status,
      confirmerName: result.row.confirmerName,
      confirmerNote: result.row.confirmerNote,
      confirmedAt: result.row.confirmedAt,
    });
  } catch (error) {
    return NextResponse.json({ error: safePublicError(error, "系統忙碌中，請稍後再試或聯繫客服") }, { status: 403 });
  }
}

export async function POST(req: NextRequest, context: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await context.params;
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const result = await submitSchoolAttendanceVerification(token, {
      action: String(body.action ?? "confirm"),
      confirmerName: String(body.confirmerName ?? ""),
      note: String(body.note ?? ""),
      snapshotHash: String(body.snapshotHash ?? ""),
    });
    await writeAuditLog(req, {
      actorName: result.confirmerName,
      actorRole: "school_contact",
      action: result.status === "confirmed" ? "approve" : "reject",
      targetType: "SchoolAttendanceVerification",
      targetLabel: "園所暑期課程人數核對",
      afterData: { status: result.status, note: result.note, confirmedAt: result.confirmedAt },
      diffSummary: result.status === "confirmed" ? "園所確認課程人數無誤" : `園所回報人數有誤：${result.note}`,
      sensitive: true,
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: safePublicError(error, "核對結果送出失敗，請稍後再試") }, { status: 400 });
  }
}
