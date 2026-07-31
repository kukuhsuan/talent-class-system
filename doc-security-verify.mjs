// 敏感文件（存摺／委任書）上傳流程的資安回歸測試。
// 重點在「錯誤訊息不外洩」與「原檔只有財務角色拿得到」這兩件事，
// 其餘（魔術位元組、連結作廢、頻率上限）一併帶到，避免日後改動時默默退化。
import crypto from "node:crypto";
import { createClient } from "@libsql/client";
import { SignJWT } from "jose";

const DB = process.env.TEST_DB;
const BASE = process.env.BASE_URL;
const SECRET = process.env.AUTH_SECRET;
const db = createClient({ url: `file:${DB}` });

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
}

// ---------- 自己簽一份 teacher_document 權杖，跟 src/lib/publicAccessToken.ts 同一套 ----------
const b64 = (v) => Buffer.from(v).toString("base64url");
function sign(payload) {
  const encoded = b64(JSON.stringify(payload));
  const sig = crypto.createHmac("sha256", new TextEncoder().encode(SECRET)).update(encoded).digest("base64url");
  return `${encoded}.${sig}`;
}
function docToken(teacherId, epoch = 0, ttlSec = 30 * 86400) {
  return sign({ type: "teacher_document", attendanceId: 0, teacherId, epoch, exp: Math.floor(Date.now() / 1000) + ttlSec });
}

async function account(username, name, role) {
  await db.execute({ sql: `DELETE FROM UserAccount WHERE username = ?`, args: [username] });
  await db.execute({
    sql: `INSERT INTO UserAccount (username, name, role, passwordHash, isActive) VALUES (?, ?, ?, 'x', 1)`,
    args: [username, name, role],
  });
  const id = Number((await db.execute({ sql: `SELECT id FROM UserAccount WHERE username = ?`, args: [username] })).rows[0].id);
  const token = await new SignJWT({ role, userId: id, username, name })
    .setProtectedHeader({ alg: "HS256" }).setExpirationTime("1h").sign(new TextEncoder().encode(SECRET));
  return `auth-token=${token}`;
}

async function api(path, init = {}, cookie = "") {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { origin: BASE, ...(cookie ? { cookie } : {}), ...(init.headers || {}) },
    redirect: "manual",
  });
  const buf = Buffer.from(await res.arrayBuffer());
  let json = null;
  try { json = JSON.parse(buf.toString("utf8")); } catch { /* 非 JSON */ }
  return { status: res.status, json, buf, headers: res.headers, text: buf.toString("utf8") };
}

// ---------- 種一位老師 ----------
const NAME = "資安測試老師";
await db.execute({ sql: `DELETE FROM Teacher WHERE name = ?`, args: [NAME] });
await db.execute({ sql: `INSERT INTO Teacher (name) VALUES (?)`, args: [NAME] });
const teacherId = Number((await db.execute({ sql: `SELECT id FROM Teacher WHERE name = ?`, args: [NAME] })).rows[0].id);
const good = docToken(teacherId);

// ---------- 1. 連結本身的驗證 ----------
let got = await api(`/api/teacher-documents/public/${encodeURIComponent(good)}`);
check("有效連結可讀到自己的文件狀態", got.status === 200 && got.json?.teacherName === NAME, `status=${got.status}`);
check("回應不含 fileUrl 等內部路徑",
  !/fileUrl|teacher-documents\/(bankbook|mandate)\//.test(got.text), got.text.slice(0, 120));

got = await api(`/api/teacher-documents/public/not-a-real-token`);
check("亂打的連結回 403", got.status === 403, `status=${got.status}`);
check("亂打的連結不外洩內部訊息",
  !/Invalid token|Error:|at \w+ \(|prisma|sqlite/i.test(got.text), got.json?.error ?? got.text.slice(0, 120));

// 竄改簽章：payload 換人，簽章沿用
const [p] = good.split(".");
const forgedPayload = b64(JSON.stringify({ type: "teacher_document", attendanceId: 0, teacherId: teacherId + 1, epoch: 0, exp: Math.floor(Date.now() / 1000) + 86400 }));
got = await api(`/api/teacher-documents/public/${encodeURIComponent(`${forgedPayload}.${good.split(".")[1]}`)}`);
check("竄改 payload 後簽章不符被擋", got.status === 403, `status=${got.status}`);
void p;

// 型別不符：拿履歷連結來上傳存摺
const resumeToken = sign({ type: "teacher_resume", attendanceId: 0, teacherId, exp: Math.floor(Date.now() / 1000) + 86400 });
got = await api(`/api/teacher-documents/public/${encodeURIComponent(resumeToken)}`);
check("履歷連結不能當文件連結用", got.status === 403, `status=${got.status}`);

// 過期
got = await api(`/api/teacher-documents/public/${encodeURIComponent(docToken(teacherId, 0, -60))}`);
check("過期連結被擋", got.status === 403, `status=${got.status}`);

// 作廢：docLinkEpoch +1 之後舊連結立刻失效
await db.execute({ sql: `UPDATE Teacher SET docLinkEpoch = 1 WHERE id = ?`, args: [teacherId] });
got = await api(`/api/teacher-documents/public/${encodeURIComponent(good)}`);
check("行政作廢後舊連結失效", got.status === 403 && /作廢/.test(got.json?.error ?? ""), got.json?.error ?? "");
const fresh = docToken(teacherId, 1);
got = await api(`/api/teacher-documents/public/${encodeURIComponent(fresh)}`);
check("重新產生的連結可用", got.status === 200, `status=${got.status}`);

// ---------- 2. 上傳內容驗證 ----------
function upload(token, { name, type, bytes }) {
  const form = new FormData();
  form.append("docType", "bankbook");
  form.append("file", new File([new Uint8Array(bytes)], name, { type }));
  return api(`/api/teacher-documents/public/${encodeURIComponent(token)}`, { method: "POST", body: form });
}
const PDF_BYTES = [0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a, 0x0a];

got = await upload(fresh, { name: "evil.pdf", type: "application/pdf", bytes: [0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00, 0, 0, 0, 0, 0, 0, 0, 0] });
check("改副檔名的執行檔被擋（魔術位元組）", got.status === 400, `status=${got.status} ${got.json?.error ?? ""}`);

got = await upload(fresh, { name: "x.txt", type: "text/plain", bytes: PDF_BYTES });
check("不在白名單的 Content-Type 被擋", got.status === 400, `status=${got.status} ${got.json?.error ?? ""}`);

got = await upload(fresh, { name: "empty.pdf", type: "application/pdf", bytes: [] });
check("空檔案被擋", got.status === 400, `status=${got.status} ${got.json?.error ?? ""}`);

// ---------- 3. 上傳失敗時不可外洩系統內部訊息（本機沒設 SENSITIVE_READ_WRITE_TOKEN） ----------
got = await upload(fresh, { name: "book.pdf", type: "application/pdf", bytes: PDF_BYTES });
const leaky = /READ_WRITE_TOKEN|Vercel|Blob|store|prisma|sqlite|Error:|at \w+ \(/i;
if (got.status === 500) {
  check("上傳遇到系統錯誤時只回制式訊息", !leaky.test(got.text), got.json?.error ?? got.text.slice(0, 160));
} else {
  check("上傳成功（本機已設定儲存空間）", got.status === 200, `status=${got.status}`);
}

// ---------- 4. GET 遇到系統錯誤時也只回制式訊息 ----------
// 把 TeacherResume 換成缺欄位的版本，讓 GET 內部的查詢真的炸掉。
// ensureTeacherResumeTables 只做 CREATE TABLE IF NOT EXISTS，不會把欄位補回來。
await db.execute(`ALTER TABLE TeacherResume RENAME TO TeacherResume_backup`);
await db.execute(`CREATE TABLE TeacherResume (id INTEGER PRIMARY KEY AUTOINCREMENT, teacherId INTEGER)`);
got = await api(`/api/teacher-documents/public/${encodeURIComponent(fresh)}`);
check("GET 遇到資料庫錯誤時回 500", got.status === 500, `status=${got.status}`);
check("GET 的錯誤訊息不外洩內部細節（本次修正重點）",
  !leaky.test(got.text) && !/no such column|SELECT/i.test(got.text),
  got.json?.error ?? got.text.slice(0, 200));
await db.execute(`DROP TABLE TeacherResume`);
await db.execute(`ALTER TABLE TeacherResume_backup RENAME TO TeacherResume`);

// ---------- 5. 原檔只有財務角色拿得到 ----------
await db.execute({ sql: `DELETE FROM TeacherDocument WHERE teacherId = ?`, args: [teacherId] });
await db.execute({
  sql: `INSERT INTO TeacherDocument (teacherId, docType, fileUrl, fileName, fileSize, contentType, uploadedBy, reviewStatus)
        VALUES (?, 'bankbook', ?, 'book.pdf', 16, 'application/pdf', ?, '待審核')`,
  args: [teacherId, `teacher-documents/bankbook/${teacherId}-fake.pdf`, NAME],
});
const docId = Number((await db.execute({ sql: `SELECT id FROM TeacherDocument WHERE teacherId = ? ORDER BY id DESC LIMIT 1`, args: [teacherId] })).rows[0].id);

got = await api(`/api/teacher-documents/${docId}/file`);
check("未登入拿不到原檔", got.status === 401 || got.status === 403 || got.status === 307, `status=${got.status}`);

const staffCookie = await account("sec-staff", "測試行政", "staff");
got = await api(`/api/teacher-documents/${docId}/file`, {}, staffCookie);
check("行政拿不到原檔", got.status === 403, `status=${got.status}`);

const ownerCookie = await account("sec-owner", "測試老闆", "owner");
got = await api(`/api/teacher-documents/${docId}/file`, {}, ownerCookie);
check("財務角色即使檔案不存在也不外洩 blob 路徑",
  !/teacher-documents\/bankbook\//.test(got.text), got.text.slice(0, 160));

// 一般清單 API 不可帶出 fileUrl
got = await api(`/api/teacher-documents?teacherIds=${teacherId}`, {}, ownerCookie);
check("文件清單不回 fileUrl", got.status !== 200 || !/fileUrl/.test(got.text), got.text.slice(0, 160));

// ---------- 6. 安全標頭 ----------
const head = await api(`/teacher-documents/${encodeURIComponent(fresh)}`);
check("nosniff 標頭存在", head.headers.get("x-content-type-options") === "nosniff", String(head.headers.get("x-content-type-options")));
check("frame 保護存在",
  (head.headers.get("x-frame-options") ?? "").toUpperCase() === "DENY"
  || /frame-ancestors\s+'none'/.test(head.headers.get("content-security-policy") ?? ""),
  `${head.headers.get("x-frame-options")} / ${head.headers.get("content-security-policy")?.slice(0, 60)}`);

// ---------- 收尾 ----------
await db.execute({ sql: `UPDATE Teacher SET docLinkEpoch = 0 WHERE id = ?`, args: [teacherId] });
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} 通過`);
process.exit(failed.length === 0 ? 0 : 1);
