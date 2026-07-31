// 驗證步驟 7-9：系統設定頁、老師待補件篩選資料、月底會計包匯款狀態與 Excel 遮罩
import zlib from "node:zlib";
import { createClient } from "@libsql/client";
import { SignJWT } from "jose";

const DB = process.env.TEST_DB;
const BASE = process.env.BASE_URL;
const secret = new TextEncoder().encode(process.env.AUTH_SECRET);
const db = createClient({ url: `file:${DB}` });

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
}

async function account(username, name, role) {
  await db.execute({ sql: `DELETE FROM UserAccount WHERE username = ?`, args: [username] });
  await db.execute({
    sql: `INSERT INTO UserAccount (username, name, role, passwordHash, isActive) VALUES (?, ?, ?, 'x', 1)`,
    args: [username, name, role],
  });
  const id = Number((await db.execute({ sql: `SELECT id FROM UserAccount WHERE username = ?`, args: [username] })).rows[0].id);
  const token = await new SignJWT({ role, userId: id, username, name })
    .setProtectedHeader({ alg: "HS256" }).setExpirationTime("1h").sign(secret);
  return `auth-token=${token}`;
}

const ownerCookie = await account("p2-owner", "測試老闆", "owner");
const staffCookie = await account("p2-staff", "測試行政", "staff");

async function api(path, init = {}, cookie = ownerCookie) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { cookie, origin: BASE, ...(init.headers || {}) },
    redirect: "manual",
  });
  const buf = Buffer.from(await res.arrayBuffer());
  let json = null;
  try { json = JSON.parse(buf.toString("utf8")); } catch { /* 非 JSON（例如 xlsx） */ }
  return { status: res.status, json, buf, headers: res.headers };
}

// ---------- 步驟 7：系統設定 ----------
let got = await api("/api/settings");
check("讀取系統設定", got.status === 200 && Array.isArray(got.json?.settings), `status=${got.status}`);
check("三個設定項目都在", (got.json?.settings ?? []).length === 3,
  (got.json?.settings ?? []).map((s) => s.key).join(", "));

// 非 https 連結必須被擋，否則會被寫進老師端頁面
let put = await api("/api/settings", {
  method: "PUT", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ settings: { "doc.template.mandate.url": "javascript:alert(1)" } }),
});
check("擋下非 https 的委任書連結", put.status === 400, `status=${put.status} ${put.json?.error ?? ""}`);

// 保留天數超出範圍要擋，否則打錯字就變成立刻全刪或永不刪除
put = await api("/api/settings", {
  method: "PUT", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ settings: { "doc.retention.days": "99999" } }),
});
check("擋下超出範圍的保留天數", put.status === 400, `status=${put.status} ${put.json?.error ?? ""}`);

put = await api("/api/settings", {
  method: "PUT", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    settings: {
      "doc.template.mandate.url": "https://example.com/mandate.pdf",
      "doc.retention.days": "180",
      "doc.template.bankbook.hint": "請拍到戶名與帳號",
    },
  }),
});
check("儲存合法設定", put.status === 200 && put.json?.changedCount === 3, `status=${put.status} ${JSON.stringify(put.json?.changedCount)}`);

const saved = new Map((put.json?.settings ?? []).map((s) => [s.key, s.value]));
check("設定確實寫進去", saved.get("doc.retention.days") === "180" && saved.get("doc.template.mandate.url") === "https://example.com/mandate.pdf",
  JSON.stringify([...saved]));

// 未定義的 key 不可以被寫進設定表
put = await api("/api/settings", {
  method: "PUT", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ settings: { "evil.key": "x" } }),
});
check("拒絕未定義的設定鍵", put.status === 400, `status=${put.status}`);
const evil = await db.execute({ sql: `SELECT count(*) AS n FROM AppSetting WHERE key = ?`, args: ["evil.key"] });
check("未定義的鍵沒被寫入資料庫", Number(evil.rows[0].n) === 0, String(evil.rows[0].n));

// 行政不是最高權限，不該改得動系統設定
const staffGet = await api("/api/settings", {}, staffCookie);
check("非最高權限讀不到系統設定", staffGet.status === 403, `status=${staffGet.status}`);

const audit = await db.execute({
  sql: `SELECT diffSummary, actorName FROM AuditLog WHERE targetType = 'AppSetting' ORDER BY id DESC LIMIT 1`,
});
check("設定變更有寫稽核",
  String(audit.rows[0]?.diffSummary ?? "").includes("180") && String(audit.rows[0]?.actorName ?? "").includes("測試老闆"),
  `${audit.rows[0]?.actorName} / ${audit.rows[0]?.diffSummary}`);

// ---------- 步驟 8：老師列表帶出註記欄位 ----------
await db.execute({ sql: `DELETE FROM Teacher WHERE name IN (?, ?)`, args: ["階段二註記老師", "階段二待補老師"] });
await db.execute({ sql: `INSERT INTO Teacher (name) VALUES (?)`, args: ["階段二註記老師"] });
await db.execute({ sql: `INSERT INTO Teacher (name) VALUES (?)`, args: ["階段二待補老師"] });
await db.execute({
  sql: `UPDATE Teacher SET bankHeldOfflineAt = CURRENT_TIMESTAMP, bankHeldOfflineBy = ? WHERE name = ?`,
  args: ["測試會計", "階段二註記老師"],
});

const list = await api("/api/teachers");
const marked = (list.json ?? []).find((t) => t.name === "階段二註記老師");
const plain = (list.json ?? []).find((t) => t.name === "階段二待補老師");
check("老師列表帶出 bankHeldOfflineAt", list.status === 200 && !!marked?.bankHeldOfflineAt, JSON.stringify(marked?.bankHeldOfflineAt));
check("未註記的老師該欄位為空", !plain?.bankHeldOfflineAt, JSON.stringify(plain?.bankHeldOfflineAt));
check("老師列表不回帳號明碼",
  (list.json ?? []).every((t) => t.bankAccountNumber === undefined),
  "有回明碼的筆數：" + (list.json ?? []).filter((t) => t.bankAccountNumber !== undefined).length);

// ---------- 步驟 9：月底會計包 ----------
const now = new Date();
const y = now.getFullYear();
const m = now.getMonth() + 1;
const monthEnd = await api(`/api/accounting-month-end?year=${y}&month=${m}`);
check("月底會計包回傳匯款統計",
  monthEnd.status === 200 && monthEnd.json?.payout && typeof monthEnd.json.payout.block === "number",
  JSON.stringify(monthEnd.json?.payout ?? null));
check("JSON 不回逐筆銀行明細", monthEnd.json?.payout?.rows === undefined, JSON.stringify(Object.keys(monthEnd.json?.payout ?? {})));

const xlsx = await api(`/api/accounting-month-end?year=${y}&month=${m}&format=xlsx`);
check("下載 Excel", xlsx.status === 200 && xlsx.buf.length > 1000, `status=${xlsx.status} bytes=${xlsx.buf.length}`);

// 真的把 xlsx 解開來看，不是搜壓縮後的位元組——壓縮過的檔案搜不到字串會假性通過，
// 「Excel 沒有帳號明碼」這種檢查一旦假性通過就完全失去意義。
// xlsx 是 zip，用內建 zlib 解出所有字串即可，不必為了測試載入 exceljs。
function xlsxStrings(buffer) {
  const out = [];
  // 逐個掃描 local file header（PK\x03\x04），解壓後取出文字
  for (let i = 0; i + 30 < buffer.length; i++) {
    if (buffer.readUInt32LE(i) !== 0x04034b50) continue;
    const method = buffer.readUInt16LE(i + 8);
    const compressed = buffer.readUInt32LE(i + 18);
    const nameLen = buffer.readUInt16LE(i + 26);
    const extraLen = buffer.readUInt16LE(i + 28);
    const start = i + 30 + nameLen + extraLen;
    if (compressed === 0 || start + compressed > buffer.length) continue;
    const chunk = buffer.subarray(start, start + compressed);
    try {
      out.push(method === 8 ? zlib.inflateRawSync(chunk).toString("utf8") : chunk.toString("utf8"));
    } catch { /* 這一段不是我們要的，略過 */ }
  }
  return out.join("\n");
}

// 種一位有真實帳號的老師（要有本月薪資才會出現在表上，所以兩種情況都檢查）
const seededAccount = "12345678901234";
await db.execute({
  sql: `UPDATE Teacher SET bankName = '測試銀行', bankCode = '013', bankAccountName = '階段二待補老師', bankAccountNumber = ? WHERE name = ?`,
  args: [seededAccount, "階段二待補老師"],
});
const xlsx2 = await api(`/api/accounting-month-end?year=${y}&month=${m}&format=xlsx`);
const ownerText = xlsxStrings(xlsx2.buf);
check("測試檔真的解壓得開", ownerText.includes("老師薪資"), `解出 ${ownerText.length} 字元`);
check("Excel 不含帳號明碼", !ownerText.includes(seededAccount),
  ownerText.includes(seededAccount) ? "檔案裡出現了完整帳號" : "");
check("Excel 帶出匯款狀態與遮罩帳號欄位",
  ownerText.includes("匯款狀態") && ownerText.includes("帳號（遮罩）"), "");

const exportAudit = await db.execute({
  sql: `SELECT diffSummary, actorName FROM AuditLog WHERE action = 'export' AND targetType = 'Salary' ORDER BY id DESC LIMIT 1`,
});
check("下載會計包有寫稽核", !!exportAudit.rows[0], JSON.stringify(exportAudit.rows[0] ?? null));

// 會計包現在每一份都帶銀行欄位，所以整支路由必須是財務角色限定。
// 行政（staff）在 SALARY_ROLES 內但不在 SENSITIVE_FINANCE_ROLES，兩種格式都要被擋，
// 只擋 xlsx 不擋 JSON 等於留一條側門。
const staffJson = await api(`/api/accounting-month-end?year=${y}&month=${m}`, {}, staffCookie);
check("行政讀不到會計包 JSON", staffJson.status === 403, `status=${staffJson.status}`);
const staffXlsx = await api(`/api/accounting-month-end?year=${y}&month=${m}&format=xlsx`, {}, staffCookie);
check("行政下載不到會計包 Excel",
  staffXlsx.status === 403 && !xlsxStrings(staffXlsx.buf).includes("帳號（遮罩）"),
  `status=${staffXlsx.status}`);

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} 通過`);
process.exit(failed.length === 0 ? 0 : 1);
