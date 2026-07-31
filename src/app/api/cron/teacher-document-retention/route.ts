import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { documentRetentionDays } from "@/lib/appSetting";
import { TEACHER_DOC_LABELS, listDocumentsToPurge, markDocumentPurged, type TeacherDocType } from "@/lib/teacherDocument";
import { deleteSensitiveDocument } from "@/lib/sensitiveBlob";
import { writeAuditLog } from "@/lib/auditLog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 存摺／委任書原檔的保留期限清除。
// 只刪 blob 原檔，TeacherDocument 那一列與審核結果都留著——
// 刪掉整列會讓發薪判斷退回「未上傳」，等於把已經審過的老師重新擋住。
async function purge(req: NextRequest | null) {
  const retentionDays = await documentRetentionDays();
  if (retentionDays === 0) {
    return { skipped: true, retentionDays, purged: 0, failed: 0, note: "保留天數設為 0，不自動刪除" };
  }

  const targets = await listDocumentsToPurge(retentionDays);
  let purged = 0;
  let failed = 0;
  const labels: string[] = [];

  for (const target of targets) {
    const ok = await deleteSensitiveDocument(target.fileUrl);
    if (!ok) {
      failed += 1;
      continue;
    }
    await markDocumentPurged(target.id);
    purged += 1;
    const teacher = await prisma.teacher
      .findUnique({ where: { id: target.teacherId }, select: { name: true } })
      .catch(() => null);
    labels.push(`${teacher?.name ?? target.teacherId}－${TEACHER_DOC_LABELS[target.docType as TeacherDocType] ?? target.docType}`);
  }

  // 刪不掉就不標記已清除（下週會再試一次），但要留紀錄——
  // 否則 blob token 掉了會變成「以為每週在刪、其實一份都沒刪」。
  if (failed > 0) {
    console.warn(`teacher-document-retention: ${failed} 份原檔刪除失敗`);
    await writeAuditLog(req, {
      action: "delete",
      actorName: "系統",
      actorRole: "cron",
      targetType: "TeacherDocument",
      targetLabel: `保留期限清除（${retentionDays} 天）`,
      diffSummary: `原檔刪除失敗 ${failed} 份，未標記為已清除，下次排程會重試`,
      sensitive: true,
    });
  }

  if (purged > 0) {
    await writeAuditLog(req, {
      action: "delete",
      actorName: "系統",
      actorRole: "cron",
      targetType: "TeacherDocument",
      targetLabel: `保留期限清除（${retentionDays} 天）`,
      diffSummary: `依保留政策刪除原檔 ${purged} 份：${labels.slice(0, 20).join("、")}${labels.length > 20 ? " 等" : ""}`,
      sensitive: true,
    });
  }

  return { skipped: false, retentionDays, purged, failed, candidates: targets.length };
}

function authorized(req: NextRequest) {
  const header = req.headers.get("authorization");
  return Boolean(process.env.CRON_SECRET) && header === `Bearer ${process.env.CRON_SECRET}`;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await purge(req));
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await purge(req));
}
