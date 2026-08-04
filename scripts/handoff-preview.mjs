// 課後交接／上一堂回顧的離線預覽產生器。
// 直接載入 src/lib/lessonHandoff.ts 的 buildLessonRecapFlex，把真正會推給老師的
// Flex JSON 渲染成 HTML，不連資料庫、不碰 LINE，可以在合併前先看版面。
//
//   node scripts/handoff-preview.mjs            → 產生 handoff-preview.html
//
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const jiti = createJiti(import.meta.url, {
  alias: { "@": path.join(root, "src") },
  interopDefault: true,
});

const { buildLessonRecapFlex } = await jiti.import(path.join(root, "src/lib/lessonHandoff.ts"));

// ── 測試資料：涵蓋三種會實際發生的情境 ────────────────────────────────
const CASES = [
  {
    name: "換老師接手（有交接提醒 + 特殊事件）",
    sameTeacher: false,
    recap: {
      courseId: 1,
      date: "2026-08-03",
      teacherId: 11,
      teacherName: "王小明",
      courseName: "帶式橄欖球",
      school: "艾倫戴爾幼兒園",
      progress: "第 7 堂 雙手傳球入門",
      outcome: "今天練胸前傳球，孩子們大多能面向隊友出手，少數還會單手丟。",
      handoffNote: "進度只上到一半，下次先補傳接球。\n小宇今天狀況比較浮動，需要多引導。\n三角錐少 2 個。",
      incidentSummary: "陳小宇｜熱身時跌倒膝蓋擦傷｜已消毒並通知家長",
      studentCount: 18,
    },
  },
  {
    name: "同一位老師接續（文案改成「你自己留下的提醒」）",
    sameTeacher: true,
    recap: {
      courseId: 2,
      date: "2026-08-01",
      teacherId: 11,
      teacherName: "王小明",
      courseName: "棒球",
      school: "快樂國小",
      progress: "第 12 堂 打擊與短打",
      outcome: "球座打擊第一次上，握棒姿勢還要再帶一次。",
      handoffNote: "下次先複習握棒，再進到推打。",
      incidentSummary: "",
      studentCount: 22,
    },
  },
  {
    name: "只有進度沒有交接（黃色提醒區不會出現）",
    sameTeacher: false,
    recap: {
      courseId: 3,
      date: "2026-07-30",
      teacherId: 12,
      teacherName: "李美華",
      courseName: "體能",
      school: "陽光幼兒園",
      progress: "第 3 堂 平衡與協調",
      outcome: "",
      handoffNote: "",
      incidentSummary: "",
      studentCount: null,
    },
  },
];

// ── Flex → HTML（只支援本卡片用到的 box / text 子集）────────────────────
const SIZE_PX = { xxs: 11, xs: 12, sm: 13, md: 14, lg: 17 };
const SPACING_PX = { xs: 4, sm: 8, md: 12 };

function esc(value) {
  return String(value).replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]);
}

function renderNode(node) {
  if (node.type === "text") {
    const style = [
      `font-size:${SIZE_PX[node.size] ?? 14}px`,
      `color:${node.color ?? "#111111"}`,
      node.weight === "bold" ? "font-weight:700" : "font-weight:400",
      node.wrap ? "white-space:pre-wrap;word-break:break-word" : "white-space:nowrap;overflow:hidden;text-overflow:ellipsis",
      node.flex != null ? `flex:${node.flex}` : "",
      "line-height:1.5",
      "margin:0",
    ].filter(Boolean).join(";");
    return `<p style="${style}">${esc(node.text)}</p>`;
  }
  if (node.type === "box") {
    const style = [
      "display:flex",
      `flex-direction:${node.layout === "horizontal" ? "row" : "column"}`,
      node.spacing ? `gap:${SPACING_PX[node.spacing] ?? 8}px` : "",
      node.backgroundColor ? `background:${node.backgroundColor}` : "",
      node.cornerRadius ? `border-radius:${node.cornerRadius}` : "",
      node.paddingAll ? `padding:${node.paddingAll}` : "",
    ].filter(Boolean).join(";");
    return `<div style="${style}">${(node.contents ?? []).map(renderNode).join("")}</div>`;
  }
  return "";
}

function renderBubble(flex) {
  const b = flex.contents;
  return `<div class="bubble">
    ${b.header ? renderNode(b.header) : ""}
    ${b.body ? renderNode(b.body) : ""}
    ${b.footer ? renderNode(b.footer) : ""}
  </div>`;
}

// ── 結構檢查：把容易踩到的 LINE Flex 限制先驗一遍 ───────────────────────
function auditFlex(flex) {
  const issues = [];
  if (!flex.altText) issues.push("缺少 altText");
  if (flex.altText && flex.altText.length > 400) issues.push(`altText 超過 400 字（${flex.altText.length}）`);

  const walk = (node, trail) => {
    if (node.type === "text") {
      if (!node.wrap && node.text.length > 20) {
        issues.push(`${trail} 文字沒有 wrap 且偏長，手機上會被截斷：「${node.text.slice(0, 18)}…」`);
      }
      if (node.text === "") issues.push(`${trail} 出現空字串 text（LINE 會回 400）`);
    }
    if (node.type === "box") {
      if (!node.contents || node.contents.length === 0) issues.push(`${trail} box 沒有 contents（LINE 會回 400）`);
      if (node.layout === "baseline" && (node.contents ?? []).some((c) => c.wrap)) {
        issues.push(`${trail} baseline box 內的 text 不支援 wrap`);
      }
      (node.contents ?? []).forEach((child, i) => walk(child, `${trail}>${node.layout}[${i}]`));
    }
  };
  for (const key of ["header", "body", "footer"]) {
    if (flex.contents[key]) walk(flex.contents[key], key);
  }
  return issues;
}

// ── 產生頁面 ──────────────────────────────────────────────────────────
const cards = CASES.map(({ name, recap, sameTeacher }) => {
  const flex = buildLessonRecapFlex(recap, { sameTeacher });
  const issues = auditFlex(flex);
  return { name, flex, issues, recap };
});

const allIssues = cards.flatMap((c) => c.issues.map((i) => `${c.name}：${i}`));

// 回報表單新欄位：與 src/app/report/[id]/page.tsx 相同的 class，用 Tailwind CDN 還原
const HANDOFF_TEMPLATES = [
  "進度未上完，下堂請先接續",
  "器材數量不足，需補",
  "有孩子狀況需多留意",
  "場地或時間有異動",
  "進度正常，可直接接下一堂",
];

const html = `<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>課後交接 × 上一堂回顧 — 離線預覽</title>
<style>
  /* 表單區塊改寫成等效的內嵌樣式，不依賴 Tailwind CDN，離線也能正確呈現 */
  .rp-card { border-radius:16px; background:#fff; padding:16px; box-shadow:0 1px 2px rgba(0,0,0,.05); }
  .rp-label { display:block; font-size:14px; font-weight:600; color:#1E293B; }
  .rp-hint { margin:4px 0 0; font-size:12px; line-height:20px; color:#64748B; }
  .rp-hint b { font-weight:600; color:#475569; }
  .rp-textarea { margin-top:12px; min-height:96px; width:100%; box-sizing:border-box; border-radius:12px;
    border:1px solid #E2E8F0; padding:12px 16px; font-size:14px; line-height:24px; outline:none;
    font-family:inherit; resize:vertical; }
  .rp-textarea:focus { border-color:#2563EB; }
  .rp-tplTitle { margin-top:8px; font-size:12px; font-weight:600; color:#94A3B8; }
  .rp-tplRow { margin-top:8px; display:flex; flex-wrap:wrap; gap:8px; }
  .rp-tpl { border-radius:12px; border:1px solid #E2E8F0; background:#F8FAFC; padding:6px 12px;
    text-align:left; font-size:12px; line-height:20px; color:#475569; cursor:pointer; font-family:inherit; }
  .rp-tpl:active { background:#F1F5F9; }
  body { background:#EEF1F5; font-family:-apple-system,"PingFang TC","Noto Sans TC",sans-serif; margin:0; }
  .wrap { max-width:1180px; margin:0 auto; padding:32px 20px 64px; }
  h1 { font-size:22px; font-weight:700; color:#1F2937; margin:0 0 4px; }
  h2 { font-size:15px; font-weight:700; color:#334155; margin:36px 0 12px; padding-bottom:8px; border-bottom:1px solid #DCE2EA; }
  .lead { font-size:13px; color:#64748B; margin:0 0 8px; line-height:1.7; }
  .grid { display:flex; gap:24px; flex-wrap:wrap; align-items:flex-start; }
  .col { flex:1; min-width:340px; }
  .caseTitle { font-size:12px; font-weight:700; color:#475569; margin:0 0 8px; }
  .phone { background:#8CABD9; border-radius:18px; padding:14px 12px; }
  .bubble { width:300px; border-radius:14px; overflow:hidden; background:#fff; box-shadow:0 2px 6px rgba(0,0,0,.16); }
  .alt { font-size:11px; color:#64748B; margin:8px 0 0; word-break:break-all; }
  .ok { background:#E7F6EC; border:1px solid #B7E3C6; color:#1F7A3F; }
  .bad { background:#FDECEA; border:1px solid #F5B7B1; color:#A93226; }
  .banner { border-radius:10px; padding:12px 14px; font-size:13px; line-height:1.7; margin:0 0 20px; }
  ul.check { margin:0; padding-left:20px; font-size:13px; color:#475569; line-height:1.9; }
</style>
</head>
<body>
<div class="wrap">
  <h1>課後交接 × 上一堂回顧 — 離線預覽</h1>
  <p class="lead">
    右邊的卡片是直接呼叫 <code>src/lib/lessonHandoff.ts</code> 的 <code>buildLessonRecapFlex()</code> 產生的，
    跟實際推給老師的 Flex JSON 是同一份，不是手繪的示意圖。
    左邊是課後回報表單新增的欄位，class 與 <code>src/app/report/[id]/page.tsx</code> 一致。
  </p>

  <div class="banner ${allIssues.length ? "bad" : "ok"}">
    ${allIssues.length
      ? `Flex 結構檢查發現 ${allIssues.length} 個問題：<br>${allIssues.map(esc).join("<br>")}`
      : "Flex 結構檢查通過：altText 長度合法、所有長文字都有 wrap、沒有空的 box 或空字串 text。"}
  </div>

  <h2>一、課後回報表單的新欄位（老師填的地方）</h2>
  <p class="lead">位置在「成果回報短文」與「課堂活動照片」之間。這段內容不會併進 <code>reportContent</code>，所以不會出現在園所與家長收到的回報裡。</p>
  <div style="max-width:520px">
    <section class="rp-card">
      <label class="rp-label">給下一堂老師的提醒（非必填）</label>
      <p class="rp-hint">
        這段<b>不會</b>出現在園所與家長的回報裡，只會在下一堂課前推播給接手的老師（同一位老師也會收到，當作課前回顧）。
      </p>
      <textarea class="rp-textarea" maxlength="500"
        placeholder="例：進度只上到一半，下次先補傳接球。小宇今天狀況比較浮動，需要多引導。三角錐少 2 個。"></textarea>
      <div>
        <div class="rp-tplTitle">常見交接事項（點選帶入後可再修改）</div>
        <div class="rp-tplRow">
          ${HANDOFF_TEMPLATES.map((t) => `<button type="button" class="rp-tpl">${esc(t)}</button>`).join("\n          ")}
        </div>
      </div>
    </section>
  </div>

  <h2>二、下一堂課前老師會收到的回顧卡片</h2>
  <div class="grid">
    ${cards.map(({ name, flex }) => `
    <div class="col">
      <p class="caseTitle">${esc(name)}</p>
      <div class="phone">${renderBubble(flex)}</div>
      <p class="alt">altText：${esc(flex.altText)}</p>
    </div>`).join("")}
  </div>

  <h2>三、上線後要在真機上確認的項目</h2>
  <ul class="check">
    <li>回報表單最下方看得到「給下一堂老師的提醒」，5 個常用句按一下會<strong>接在既有內容後面</strong>而不是覆蓋。</li>
    <li>送出後，園所／家長端收到的回報內容裡<strong>沒有</strong>這段交接文字。</li>
    <li>下一堂課前，老師 LINE 在課程提醒後面多收到一張藍色「上一堂回顧」。</li>
    <li>換老師時黃色區塊標題是「○○○老師留給你的提醒」；同一位老師接續時是「你自己留下的提醒」。</li>
    <li>上一堂沒送出回報，或進度／成果／交接／事件四項全空時，<strong>不會</strong>推卡片。</li>
    <li>一位老師同一天有多堂課時，回顧卡片最多 3 張（LINE 單次 push 上限 5 則，主提醒佔 1 則）。</li>
  </ul>
</div>
</body>
</html>`;

const out = path.join(root, "handoff-preview.html");
fs.writeFileSync(out, html, "utf8");
console.log(`已產生 ${out}`);
console.log(allIssues.length ? `⚠️ Flex 檢查有 ${allIssues.length} 個問題：\n- ${allIssues.join("\n- ")}` : "✅ Flex 結構檢查通過");
for (const { name, flex } of cards) {
  console.log(`\n── ${name}\n   altText: ${flex.altText}`);
}
