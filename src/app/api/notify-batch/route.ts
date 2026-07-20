import { NextRequest, NextResponse } from "next/server";
import { NOTIFY_ROLES, requireRole, sameOriginOk } from "@/lib/permissions";
import { writeAuditLog } from "@/lib/auditLog";
import { buildBatchMessages, getTemplate, NOTIFY_TEMPLATES, type NotifyTargetType, type NotifyTemplateKey } from "@/lib/notifyTemplates";
import { BATCH_MAX_RECIPIENTS, deleteTemplateOverride, getBatchByUuid, getTemplateOverrides, hasDangerousLink, listBatches, maskLineId, runNotifyBatch, saveTemplateOverride } from "@/lib/notifyBatch";

// GET：範本清單＋最近批次紀錄
export async function GET() {
  const { response } = await requireRole(NOTIFY_ROLES);
  if (response) return response;
  const [batches, overrides] = await Promise.all([listBatches(50), getTemplateOverrides()]);
  return NextResponse.json({
    templates: NOTIFY_TEMPLATES.map(({ key, label, target, editable, needsTyphoonStatus, needsAck, description, defaultBody }) => {
      const saved = overrides.get(key);
      return {
        key, label, target, editable, needsTyphoonStatus: Boolean(needsTyphoonStatus), needsAck: Boolean(needsAck), description,
        defaultBody: saved?.body || defaultBody, // 已儲存的自訂內容優先帶入
        builtinBody: defaultBody,
        customized: Boolean(saved),
        customizedBy: saved?.updatedBy ?? "",
      };
    }),
    batches,
  });
}

type PostBody = {
  action?: string;            // "preview" | "send"
  uuid?: string;              // 批次 idempotency key（send 必填）
  templateKey?: string;
  targetType?: string;        // "teacher" | "school"
  recipientIds?: unknown[];
  customBody?: string;
  typhoonStatus?: string;
  testMode?: boolean;         // 只傳給測試人員
  confirm?: boolean;          // send 必須為 true（我已確認收件人及訊息）
  dryRun?: boolean;           // 模擬發送，不打 LINE API
};

// POST：preview（逐一收件人實際訊息預覽）／send（正式發送）
export async function POST(req: NextRequest) {
  const { user, response } = await requireRole(NOTIFY_ROLES);
  if (response) return response;
  if (!sameOriginOk(req)) return NextResponse.json({ error: "來源不合法" }, { status: 403 });

  let body: PostBody;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "請求格式錯誤" }, { status: 400 }); }

  const targetType: NotifyTargetType = body.targetType === "school" ? "school" : "teacher";
  const template = getTemplate(String(body.templateKey ?? ""));
  if (!template) return NextResponse.json({ error: "請選擇通知範本" }, { status: 400 });

  // 儲存／還原自訂範本內容（全客服共用）
  if (body.action === "save_template" || body.action === "reset_template") {
    if (!template.editable) return NextResponse.json({ error: "此範本不可編輯" }, { status: 400 });
    if (body.action === "save_template") {
      const saved = String(body.customBody ?? "").slice(0, 4000);
      if (!saved.trim()) return NextResponse.json({ error: "範本內容不可為空" }, { status: 400 });
      if (hasDangerousLink(saved)) return NextResponse.json({ error: "訊息內容包含不允許的連結協定" }, { status: 400 });
      await saveTemplateOverride(template.key, saved, user?.name ?? "");
    } else {
      await deleteTemplateOverride(template.key);
    }
    await writeAuditLog(req, {
      action: body.action === "save_template" ? "notify_template_save" : "notify_template_reset",
      targetType: "NotifyTemplate", targetId: 0, targetLabel: `通知範本：${template.label}`,
      diffSummary: body.action === "save_template" ? "儲存自訂內容" : "還原預設內容",
    });
    return NextResponse.json({ ok: true, body: body.action === "save_template" ? String(body.customBody ?? "").slice(0, 4000) : template.defaultBody });
  }

  const action = body.action === "send" ? "send" : "preview";

  const recipientIds = Array.isArray(body.recipientIds)
    ? [...new Set(body.recipientIds.map(Number).filter((n) => Number.isInteger(n) && n > 0))]
    : [];
  if (recipientIds.length === 0) return NextResponse.json({ error: "請先選擇收件人" }, { status: 400 });
  if (recipientIds.length > BATCH_MAX_RECIPIENTS) {
    return NextResponse.json({ error: `單批最多 ${BATCH_MAX_RECIPIENTS} 位收件人，目前選了 ${recipientIds.length} 位` }, { status: 400 });
  }
  const customBody = typeof body.customBody === "string" ? body.customBody.slice(0, 4000) : undefined;
  if (customBody != null && hasDangerousLink(customBody)) {
    return NextResponse.json({ error: "訊息內容包含不允許的連結協定" }, { status: 400 });
  }

  let recipients;
  try {
    recipients = await buildBatchMessages({
      templateKey: template.key as NotifyTemplateKey,
      targetType,
      recipientIds,
      customBody,
      typhoonStatus: typeof body.typhoonStatus === "string" ? body.typhoonStatus : undefined,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }

  const containsPublicLink = recipients.some((r) => r.message.includes("/school-portal/"));
  const oaGroups: Record<string, number> = {};
  for (const r of recipients) {
    if (r.skipped || !r.lineUserId) continue;
    oaGroups[r.lineRegion] = (oaGroups[r.lineRegion] ?? 0) + 1;
  }

  if (action === "preview") {
    return NextResponse.json({
      template: { key: template.key, label: template.label },
      targetType,
      total: recipients.length,
      sendable: recipients.filter((r) => !r.skipped && r.lineUserId && r.message.trim()).length,
      unbound: recipients.filter((r) => !r.skipped && !r.lineUserId).map((r) => ({ id: r.id, name: r.name })),
      skipped: recipients.filter((r) => r.skipped).map((r) => ({ id: r.id, name: r.name, reason: r.skipped })),
      oaGroups,
      containsPublicLink,
      recipients: recipients.map((r) => ({
        id: r.id, name: r.name, lineBound: Boolean(r.lineUserId), maskedLineId: maskLineId(r.lineUserId),
        lineRegion: r.lineRegion, message: r.message, skipped: r.skipped ?? "", ackButton: Boolean(r.ackUrl),
      })),
    });
  }

  // 正式發送
  if (body.confirm !== true) {
    return NextResponse.json({ error: "請先勾選「我已確認收件人及訊息」" }, { status: 400 });
  }
  const uuid = String(body.uuid ?? "").trim();
  if (!/^[0-9a-fA-F-]{20,64}$/.test(uuid)) {
    return NextResponse.json({ error: "批次識別碼無效，請重新整理頁面再試" }, { status: 400 });
  }
  const dryRun = body.dryRun === true;
  const testMode = body.testMode === true;

  // 已存在同 uuid 批次 → 直接回傳，不重發
  const existed = await getBatchByUuid(uuid);
  if (existed) return NextResponse.json({ batch: existed, duplicated: true });

  const { batch, duplicated } = await runNotifyBatch({
    uuid,
    actor: { userId: user?.userId ?? null, name: user?.name ?? "", role: user?.role ?? "" },
    templateKey: template.key,
    templateLabel: template.label,
    targetType,
    recipients,
    testMode,
    dryRun,
  });

  await writeAuditLog(req, {
    action: "notify_batch_send",
    targetType: "NotifyBatch",
    targetId: batch.id,
    targetLabel: `批次通知：${template.label}（${targetType === "teacher" ? "老師" : "園所"} ${recipients.length} 位）`,
    diffSummary: `成功 ${batch.success}／失敗 ${batch.failed}／未綁定 ${batch.unbound}／略過 ${batch.skipped}${dryRun ? "（dry-run 模擬）" : ""}${testMode ? "（測試模式）" : ""}`,
    sensitive: true,
  });

  return NextResponse.json({ batch, duplicated });
}
