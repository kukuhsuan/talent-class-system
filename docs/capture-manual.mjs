import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require(
  "/Users/weichenghsu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
);

const baseUrl = process.env.MANUAL_BASE_URL || "http://127.0.0.1:3000";
const password = process.env.MANUAL_ADMIN_PASSWORD || "admin123";
const outputDir = path.resolve("docs/assets/manual");

const pages = [
  ["dashboard", "今日概況", "/"],
  ["schedule", "週課表", "/schedule"],
  ["attendance", "出勤紀錄", "/attendance"],
  ["courses", "課程排班", "/courses"],
  ["assessments", "學期評量", "/assessments"],
  ["schools", "園所管理", "/schools"],
  ["teachers", "老師管理", "/teachers"],
  ["salary", "薪資計算", "/salary"],
  ["notify", "LINE 通知", "/notify"],
  ["teacher-leaves", "老師請假", "/teacher-leaves"],
  ["course-change-requests", "課程異動申請", "/course-change-requests"],
  ["alerts", "異常管理", "/alerts"],
  ["summer-import", "課程匯入", "/courses/summer-import"],
  ["school-stats", "園所上課報表", "/school-stats"],
  ["settings", "系統設定", "/users"],
];

await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1100 },
  deviceScaleFactor: 1,
});
const page = await context.newPage();

const loginResponse = await context.request.post(`${baseUrl}/api/auth/login`, {
  data: { password },
});
if (!loginResponse.ok()) {
  throw new Error(`Login failed: ${loginResponse.status()} ${await loginResponse.text()}`);
}

const meta = [];
for (const [slug, title, url] of pages) {
  await page.goto(`${baseUrl}${url}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(500);

  const boxes = await page.evaluate(() => {
    const visible = (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none"
        && style.visibility !== "hidden"
        && rect.width > 10
        && rect.height > 10
        && rect.bottom > 0
        && rect.top < innerHeight;
    };
    const box = (element) => {
      const rect = element.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    };
    const text = (element) => (
      element.getAttribute("aria-label")
      || element.textContent
      || element.getAttribute("placeholder")
      || ""
    ).trim();
    const inputs = [...document.querySelectorAll("input, textarea")].filter(visible);
    const selects = [...document.querySelectorAll("select")].filter(visible);
    const actions = [...document.querySelectorAll("button, a")].filter(visible);
    const search = inputs.find((element) => /搜尋|search/i.test(element.getAttribute("placeholder") || ""));
    const filters = [
      ...selects,
      ...actions.filter((element) => /全部|年份|月份|地區|類型|老師|園所|部門|待回報|已回報|代課|停課|本週|上一週|下一週/.test(text(element))),
    ].slice(0, 12);
    const add = actions.find((element) => /新增|正式匯入/.test(text(element)));
    const exportAction = actions.find((element) => /匯出|Excel|下載 PDF|批次產生證書/.test(text(element)));
    const union = (elements) => {
      const rects = elements.map(box);
      if (!rects.length) return null;
      const x = Math.min(...rects.map((rect) => rect.x));
      const y = Math.min(...rects.map((rect) => rect.y));
      const right = Math.max(...rects.map((rect) => rect.x + rect.width));
      const bottom = Math.max(...rects.map((rect) => rect.y + rect.height));
      return { x, y, width: right - x, height: bottom - y };
    };
    return {
      search: search ? box(search) : null,
      filter: union(filters),
      add: add ? box(add) : null,
      export: exportAction ? box(exportAction) : null,
    };
  });

  await page.evaluate((calloutBoxes) => {
    const names = {
      search: "① 搜尋區",
      filter: "② 篩選區",
      add: "③ 新增按鈕",
      export: "④ 匯出按鈕",
    };
    for (const [key, rect] of Object.entries(calloutBoxes)) {
      if (!rect) continue;
      const callout = document.createElement("div");
      callout.style.cssText = [
        "position:absolute",
        "z-index:2147483646",
        "pointer-events:none",
        "border:3px solid #f97316",
        "border-radius:8px",
        "background:rgba(249,115,22,.08)",
        `left:${Math.max(0, rect.x - 4 + scrollX)}px`,
        `top:${Math.max(0, rect.y - 4 + scrollY)}px`,
        `width:${rect.width + 8}px`,
        `height:${rect.height + 8}px`,
      ].join(";");
      document.body.appendChild(callout);

      const label = document.createElement("div");
      label.textContent = names[key];
      label.style.cssText = [
        "position:absolute",
        "z-index:2147483647",
        "pointer-events:none",
        "background:#f97316",
        "color:white",
        "border-radius:999px",
        "padding:4px 9px",
        "font:700 14px Arial,sans-serif",
        `left:${Math.max(0, rect.x + scrollX)}px`,
        `top:${Math.max(0, rect.y - 28 + scrollY)}px`,
      ].join(";");
      document.body.appendChild(label);
    }
  }, boxes);

  await page.screenshot({ path: path.join(outputDir, `${slug}.png`), fullPage: true });
  meta.push({
    slug,
    title,
    url,
    boxes,
    headings: await page.locator("h1, h2").allTextContents(),
    buttons: (await page.locator("button").allTextContents()).slice(0, 40),
  });
}

await writeFile(path.join(outputDir, "page-meta.json"), JSON.stringify(meta, null, 2));
await browser.close();
console.log(`Captured ${meta.length} manual pages.`);
