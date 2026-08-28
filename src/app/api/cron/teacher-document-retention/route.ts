import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { bankbookRetentionDays, documentRetentionDays } from "@/lib/appSetting";
import { DOC_STATUS, TEACHER_DOC_LABELS, listBankbooksNearingPurge, listDocumentsToPurge, markDocumentPurged, type TeacherDocType } from "@/lib/teacherDocument";
import { deleteSensitiveDocument } from "@/lib/sensitiveBlob";
import { writeAuditLog } from "@/lib/auditLog";
import { processSensitiveBlobDeletionQueue } from "@/lib/sensitiveBlobDeletionQueue";
import { raiseSystemAlert } from "@/lib/systemAlerts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 存摺／委任書原檔的保留期限清除。
// 只刪 blob 原檔，TeacherDocument 那一列與審核結果都留著——
// 刪掉整列會讓發薪判斷退回「未上傳」，等於把已經審過的老師重新擋住。
// 例外：存摺若到期時仍未審核，原檔沒了也審不了，狀態才退回未上傳。
async function purge(req: NextRequest | null) {
  const [mandateDays, bankbookDays] = await Promise.all([documentRetentionDays(), bankbookRetentionDays()]);
  const retentionDays = mandateDays;
  // 即使管理者把定期清除設為 0，先前已排入的刪除失敗工作仍必須重試。
  const targets = await listDocumentsToPurge({ bankbookDays, mandateDays });
  let purged = 0;
  let failed = 0;
  const labels: string[] = [];
  // 到期時仍未審核的存摺：檔案刪了就得請老師重傳，收集起來開單給行政聯絡
  const needsReupload: string[] = [];

  for (const target of targets) {
    const deletion = await deleteSensitiveDocument(target.fileUrl);
    if (!deletion.ok) {
      failed += 1;
      continue;
    }
    // 未審核完成的存摺：檔案沒了就審不了，狀態退回未上傳，行政才看得出要請老師重傳
    const wasUnreviewed = target.docType === "bankbook" && target.reviewStatus !== DOC_STATUS.done;
    await markDocumentPurged(target.id, wasUnreviewed);
    purged += 1;
    const teacher = await prisma.teacher
      .findUnique({ where: { id: target.teacherId }, select: { name: true } })
      .catch(() => null);
    const teacherLabel = teacher?.name ?? `#${target.teacherId}`;
    labels.push(`${teacherLabel}－${TEACHER_DOC_LABELS[target.docType as TeacherDocType] ?? target.docType}`);
    if (wasUnreviewed) needsReupload.push(teacherLabel);
  }

  // 系統不主動通知老師，改由行政依這張單逐一聯絡
  if (needsReupload.length > 0) {
    await raiseSystemAlert({
      level: "P2",
      category: "敏感文件",
      title: `${needsReupload.length} 位老師的存摺已到期刪除，需請老師重傳`,
      detail: `下列老師的存摺在保留期限（${bankbookDays} 天）內未完成審核，原檔已刪除、狀態退回未上傳，請行政聯絡老師重新上傳：${needsReupload.join("、")}`,
      dedupeKey: `bankbook-reupload-${new Date().toISOString().slice(0, 10)}`,
    });
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
      targetLabel: `保留期限清除（存摺 ${bankbookDays} 天／委任書 ${mandateDays} 天）`,
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
      targetLabel: `保留期限清除（存摺 ${bankbookDays} 天／委任書 ${mandateDays} 天）`,
      diffSummary: `依保留政策刪除原檔 ${purged} 份：${labels.slice(0, 20).join("、")}${labels.length > 20 ? " 等" : ""}`,
      sensitive: true,
    });
  }

  const retry = await processSensitiveBlobDeletionQueue();
  if (retry.completed.length > 0 || retry.failed.length > 0) {
    await writeAuditLog(req, {
      action: "delete",
      actorName: "系統",
      actorRole: "cron",
      targetType: "SensitiveBlobDeletionQueue",
      targetLabel: "敏感文件刪除重試",
      diffSummary: `重試 ${retry.processed} 份；成功 ${retry.completed.length} 份；失敗 ${retry.failed.length} 份`,
      sensitive: true,
    });
  }
  for (const item of retry.failed.filter((row) => row.attempts >= 5)) {
    await raiseSystemAlert({
      level: "P1",
      category: "敏感文件",
      title: "敏感原檔持續刪除失敗",
      detail: `刪除工作編號 ${item.id} 已失敗 ${item.attempts} 次，請管理員檢查 Vercel Blob 設定。`,
      dedupeKey: `sensitive-blob-delete-${item.id}`,
    });
  }

  // 到期前 7 天仍未審核的存摺：刪掉就得請老師重傳，先開單提醒行政補審
  const nearing = await listBankbooksNearingPurge(bankbookDays, 7).catch(() => []);
  if (nearing.length > 0) {
    const names = await prisma.teacher
      .findMany({ where: { id: { in: nearing.map((row) => row.teacherId) } }, select: { id: true, name: true } })
      .catch(() => [] as Array<{ id: number; name: string }>);
    const nameById = new Map(names.map((row) => [row.id, row.name]));
    await raiseSystemAlert({
      level: "P2",
      category: "敏感文件",
      title: `${nearing.length} 份存摺即將到期刪除`,
      detail: `以下老師的存摺上傳已滿 ${Math.max(bankbookDays - 7, 0)} 天且尚未審核完成，${bankbookDays} 天到期後原檔會自動刪除，需請老師重傳：${nearing
        .map((row) => nameById.get(row.teacherId) ?? `#${row.teacherId}`)
        .join("、")}`,
      dedupeKey: `bankbook-retention-warning-${new Date().toISOString().slice(0, 10)}`,
    });
  }

  return {
    skipped: bankbookDays === 0 && mandateDays === 0,
    retentionDays,
    bankbookDays,
    mandateDays,
    purged,
    failed,
    candidates: targets.length,
    needsReupload: needsReupload.length,
    nearingExpiry: nearing.length,
    deletionRetry: { processed: retry.processed, completed: retry.completed.length, failed: retry.failed.length },
    ...(bankbookDays === 0 && mandateDays === 0 ? { note: "保留天數設為 0，未執行到期清除；刪除重試仍有執行" } : {}),
  };
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
