/* 批次通知 dry-run 模擬驗收（絕不打 LINE API）
   執行：TURSO_DATABASE_URL="file:/tmp/notifytest.db" npx tsx scripts/notify-batch-drytest.ts */
import { prisma } from "../src/lib/prisma";
import { buildBatchMessages } from "../src/lib/notifyTemplates";
import { runNotifyBatch, getBatchByUuid, listBatchRecipients, hasDangerousLink, maskLineId, BATCH_MAX_RECIPIENTS, getAckInfo, confirmAck, confirmAckByLineUser } from "../src/lib/notifyBatch";
import { getLineConfig, normalizeLineRegion } from "../src/lib/line";
import crypto from "crypto";

let pass = 0, fail = 0;
function check(name: string, ok: boolean, extra = "") {
  if (ok) { pass++; console.log(`✅ ${name}`); }
  else { fail++; console.log(`❌ ${name} ${extra}`); }
}

async function main() {
  // 測試環境建表（沙箱無法 prisma db push；欄位對齊 schema.prisma 的 Teacher）
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS Teacher (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      rateAfterSchool INTEGER NOT NULL DEFAULT 500,
      rateInSchool INTEGER NOT NULL DEFAULT 500,
      rateDemo INTEGER NOT NULL DEFAULT 200,
      travelFee INTEGER NOT NULL DEFAULT 0,
      isAssistant BOOLEAN NOT NULL DEFAULT 0,
      assistantFee INTEGER NOT NULL DEFAULT 0,
      notes TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      bankName TEXT NOT NULL DEFAULT '',
      bankCode TEXT NOT NULL DEFAULT '',
      bankBranch TEXT NOT NULL DEFAULT '',
      bankAccountName TEXT NOT NULL DEFAULT '',
      bankAccountNumber TEXT NOT NULL DEFAULT '',
      lineUserId TEXT UNIQUE,
      lineBindCode TEXT UNIQUE,
      lineRegion TEXT NOT NULL DEFAULT '',
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  // ── 種子資料：120 位老師（前 100 綁定、其中北南分流；20 未綁定）──
  await prisma.$executeRawUnsafe("DELETE FROM Teacher").catch(() => undefined);
  for (let i = 1; i <= 120; i++) {
    const bound = i <= 100;
    const region = i % 2 === 0 ? "south" : "north";
    await prisma.teacher.create({
      data: {
        name: `測試老師${String(i).padStart(3, "0")}`,
        lineUserId: bound ? `U${crypto.randomBytes(16).toString("hex")}` : null,
        lineRegion: region,
      },
    });
  }
  const all = await prisma.teacher.findMany({ select: { id: true }, orderBy: { id: "asc" } });
  const boundIds = all.slice(0, 100).map((t) => t.id);
  const unboundIds = all.slice(100).map((t) => t.id);

  // ── 1. 範本組裝：每人訊息個人化、不含他人資料 ──
  const msgs = await buildBatchMessages({ templateKey: "class_notes", targetType: "teacher", recipientIds: boundIds.slice(0, 5) });
  check("每位收件人訊息帶入自己的姓名", msgs.every((m) => m.message.includes(m.name)));
  check("訊息不含其他老師姓名", msgs.every((m) => !msgs.some((o) => o.id !== m.id && m.message.includes(o.name))));

  // ── 2. 颱風範本：未選狀態必須擋下、不預設停課 ──
  const typhoonErr = await buildBatchMessages({ templateKey: "typhoon", targetType: "teacher", recipientIds: boundIds.slice(0, 2) }).then(() => "", (e) => e.message);
  check("颱風範本未選狀態被拒絕", typhoonErr.includes("課程狀態"));
  const typhoonOk = await buildBatchMessages({ templateKey: "typhoon", targetType: "teacher", recipientIds: boundIds.slice(0, 2), typhoonStatus: "等待園所確認" });
  check("颱風範本帶入所選狀態", typhoonOk.every((m) => m.message.includes("等待園所確認")));

  // ── 3. 範本／對象不符 ──
  const mismatch = await buildBatchMessages({ templateKey: "school_term", targetType: "teacher", recipientIds: boundIds.slice(0, 1) }).then(() => "", (e) => e.message);
  check("範本與對象類型不符被拒絕", mismatch.includes("不符"));

  // ── 4. 100 人批次 dry-run（含 20 位未綁定混入 → 超量擋下）──
  const over = [...boundIds, ...unboundIds]; // 120 位
  const build120 = await buildBatchMessages({ templateKey: "class_notes", targetType: "teacher", recipientIds: over });
  const overErr = await runNotifyBatch({
    uuid: crypto.randomUUID(), actor: { userId: 1, name: "測試", role: "customer_service" },
    templateKey: "class_notes", templateLabel: "上課注意事項", targetType: "teacher",
    recipients: build120, testMode: false, dryRun: true,
  }).then(() => "", (e) => e.message);
  check(`超過 ${BATCH_MAX_RECIPIENTS} 位被拒絕`, overErr.includes("100"));

  const mix = await buildBatchMessages({ templateKey: "class_notes", targetType: "teacher", recipientIds: [...boundIds.slice(0, 80), ...unboundIds] }); // 80 綁定 + 20 未綁定 = 100
  const uuid1 = crypto.randomUUID();
  const t0 = Date.now();
  const run1 = await runNotifyBatch({
    uuid: uuid1, actor: { userId: 1, name: "測試客服", role: "customer_service" },
    templateKey: "class_notes", templateLabel: "上課注意事項", targetType: "teacher",
    recipients: mix, testMode: false, dryRun: true,
  });
  check("100 人 dry-run：成功 80", run1.batch.success === 80, `got ${run1.batch.success}`);
  check("100 人 dry-run：未綁定 20", run1.batch.unbound === 20, `got ${run1.batch.unbound}`);
  check("100 人 dry-run：失敗 0", run1.batch.failed === 0);
  console.log(`   （100 人批次耗時 ${Date.now() - t0}ms）`);

  // ── 5. 重複點擊／idempotency：同 uuid 不重發 ──
  const run2 = await runNotifyBatch({
    uuid: uuid1, actor: { userId: 1, name: "測試客服", role: "customer_service" },
    templateKey: "class_notes", templateLabel: "上課注意事項", targetType: "teacher",
    recipients: mix, testMode: false, dryRun: true,
  });
  check("同一 uuid 重送 → duplicated，不重複發送", run2.duplicated === true && run2.batch.id === run1.batch.id);
  const sameBatch = await getBatchByUuid(uuid1);
  check("批次紀錄只有一筆、計數不變", sameBatch?.success === 80);

  // ── 6. 同批次同收件人重複 → UNIQUE 去重 ──
  const dup = await buildBatchMessages({ templateKey: "class_notes", targetType: "teacher", recipientIds: [boundIds[0], boundIds[0], boundIds[1]] });
  check("重複收件人 id 已在組裝時去重", dup.length === 2);

  // ── 7. 部分失敗＋重試：真發送模式但 token 未設定 → 全部失敗（每人重試 1 次），且錯誤不洩漏 token ──
  const failRecipients = mix.slice(0, 5);
  const runFail = await runNotifyBatch({
    uuid: crypto.randomUUID(), actor: { userId: 1, name: "測試客服", role: "customer_service" },
    templateKey: "class_notes", templateLabel: "上課注意事項", targetType: "teacher",
    recipients: failRecipients, testMode: true, dryRun: false, // 無 LINE_*_TOKEN 環境變數 → pushMessage 必然失敗
  });
  check("token 未設定 → 失敗 5（不會 crash）", runFail.batch.failed === 5, `got ${runFail.batch.failed}`);
  const failRows = await listBatchRecipients(runFail.batch.id);
  check("失敗原因已記錄且不含 Bearer/token", failRows.every((r) => r.status !== "failed" || (r.error.length > 0 && !/Bearer\s+[A-Za-z0-9]/.test(r.error))));

  // ── 8. 未綁定與遮罩 ──
  const rows1 = await listBatchRecipients(run1.batch.id);
  check("未綁定收件人記錄為 unbound", rows1.filter((r) => r.status === "unbound").length === 20);
  check("紀錄只存遮罩 LINE ID（前6碼+…）", rows1.every((r) => !r.maskedLineId || /^.{6}…$/.test(r.maskedLineId)));
  check("maskLineId 格式正確", maskLineId("U1234567890abcdef") === "U12345…" && maskLineId(null) === "");

  // ── 9. 北／南／園所 OA 分流 ──
  const regions = new Set(mix.filter((m) => m.lineUserId).map((m) => m.lineRegion));
  check("批次內同時存在北部與南部分組", regions.has("north") && regions.has("south"));
  check("north/south/school/school2 各取各的 token 設定", (() => {
    process.env.LINE_NORTH_TOKEN = "tokN"; process.env.LINE_SOUTH_TOKEN = "tokS";
    process.env.LINE_SCHOOL_TOKEN = "tok1"; process.env.LINE_SCHOOL2_TOKEN = "tok2";
    const ok = getLineConfig("north").token === "tokN" && getLineConfig("south").token === "tokS"
      && getLineConfig("school").token === "tok1" && getLineConfig("school2").token === "tok2"
      && normalizeLineRegion("怪值") === "north";
    delete process.env.LINE_NORTH_TOKEN; delete process.env.LINE_SOUTH_TOKEN;
    delete process.env.LINE_SCHOOL_TOKEN; delete process.env.LINE_SCHOOL2_TOKEN;
    return ok;
  })());

  // ── 10. 危險連結與空訊息 ──
  check("javascript: 連結被判定危險", hasDangerousLink("點我 javascript:alert(1)") && !hasDangerousLink("https://talent-class-system.vercel.app/x"));
  const evil = [{ id: 999, name: "壞訊息", lineUserId: "Uevil", lineRegion: "north", message: "javascript:alert(1)" }];
  const runEvil = await runNotifyBatch({
    uuid: crypto.randomUUID(), actor: { userId: 1, name: "測試", role: "customer_service" },
    templateKey: "class_notes", templateLabel: "上課注意事項", targetType: "teacher",
    recipients: evil, testMode: true, dryRun: true,
  });
  check("危險協定訊息被略過不發送", runEvil.batch.skipped === 1 && runEvil.batch.success === 0);

  // ── 11. 教練工作提醒事項：每人專屬確認連結＋確認收到 ──
  const coach = await buildBatchMessages({ templateKey: "coach_rules", targetType: "teacher", recipientIds: boundIds.slice(0, 3) });
  check("教練範本每人帶專屬確認按鈕連結（內文不含網址）", coach.every((m) => m.ackToken && m.ackUrl?.includes(`/notify-ack/${m.ackToken}`) && !m.message.includes("notify-ack")));
  check("確認連結每人不同", new Set(coach.map((m) => m.ackToken)).size === 3);
  const runCoach = await runNotifyBatch({
    uuid: crypto.randomUUID(), actor: { userId: 1, name: "測試客服", role: "customer_service" },
    templateKey: "coach_rules", templateLabel: "教練工作提醒事項", targetType: "teacher",
    recipients: coach, testMode: false, dryRun: true,
  });
  const ackToken = coach[0].ackToken!;
  const info0 = await getAckInfo(ackToken);
  check("確認頁可查到收件人且尚未確認", info0?.name === coach[0].name && info0?.ackAt === null);
  const acked = await confirmAck(ackToken);
  check("點選確認後記錄 ackAt", Boolean(acked?.ackAt));
  const acked2 = await confirmAck(ackToken);
  check("重複確認不改變首次時間", acked2?.ackAt === acked?.ackAt);
  const coachRows = await listBatchRecipients(runCoach.batch.id);
  check("紀錄明細只有 1 位顯示已確認", coachRows.filter((r) => r.ackAt).length === 1);
  check("無效 token 回 null", (await getAckInfo("zz".repeat(16))) === null && (await getAckInfo("abc")) === null);
  const wrongUser = await confirmAckByLineUser(coach[1].ackToken!, "U_not_the_recipient");
  check("非本人按按鈕不記錄", wrongUser.ok === false);
  const byButton = await confirmAckByLineUser(coach[1].ackToken!, coach[1].lineUserId!);
  check("本人按 LINE 按鈕直接記錄", byButton.ok === true && byButton.already === false);
  const byButton2 = await confirmAckByLineUser(coach[1].ackToken!, coach[1].lineUserId!);
  check("重複按按鈕回覆已確認過", byButton2.ok === true && byButton2.already === true);

  console.log(`\n結果：${pass} 通過／${fail} 失敗`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
