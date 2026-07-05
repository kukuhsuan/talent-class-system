import { createRequire } from "node:module";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require(
  "/Users/weichenghsu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
);

const root = process.cwd();
const markdownPath = path.join(root, "docs/System-Manual.md");
const htmlPath = path.join(root, "docs/System-Manual.html");
const pdfPath = path.join(root, "docs/System-Manual.pdf");

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function inlineMarkdown(value) {
  return escapeHtml(value)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
}

function renderMarkdown(markdown) {
  const lines = markdown.split(/\r?\n/);
  const html = [];
  let inList = false;

  const closeList = () => {
    if (inList) {
      html.push("</ul>");
      inList = false;
    }
  };

  for (const line of lines) {
    if (!line.trim()) {
      closeList();
      continue;
    }

    const imageMatch = line.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (imageMatch) {
      closeList();
      const src = path.resolve(path.dirname(markdownPath), imageMatch[2]);
      html.push(`<figure><img src="file://${src}" alt="${escapeHtml(imageMatch[1])}"><figcaption>${escapeHtml(imageMatch[1])}</figcaption></figure>`);
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      closeList();
      const level = heading[1].length;
      html.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`);
      continue;
    }

    const bullet = line.match(/^[-*]\s+(.+)$/) || line.match(/^\d+\.\s+(.+)$/);
    if (bullet) {
      if (!inList) {
        html.push("<ul>");
        inList = true;
      }
      html.push(`<li>${inlineMarkdown(bullet[1])}</li>`);
      continue;
    }

    closeList();
    html.push(`<p>${inlineMarkdown(line)}</p>`);
  }
  closeList();
  return html.join("\n");
}

const markdown = await readFile(markdownPath, "utf8");
const body = renderMarkdown(markdown);
const html = `<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8">
  <title>WaysLeader AI 系統使用手冊</title>
  <style>
    @page { size: A4; margin: 16mm 14mm; }
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", Arial, sans-serif;
      color: #1f2937;
      line-height: 1.72;
      font-size: 12px;
    }
    h1, h2, h3 { color: #0f172a; line-height: 1.25; page-break-after: avoid; }
    h1 { font-size: 28px; padding-bottom: 10px; border-bottom: 3px solid #1d4ed8; margin: 0 0 18px; }
    h2 { font-size: 20px; margin: 26px 0 10px; padding-top: 8px; border-top: 1px solid #cbd5e1; }
    h3 { font-size: 15px; margin: 18px 0 8px; color: #1d4ed8; }
    p { margin: 6px 0; }
    ul { margin: 6px 0 10px 20px; padding: 0; }
    li { margin: 3px 0; }
    code { background: #f1f5f9; border: 1px solid #e2e8f0; padding: 1px 4px; border-radius: 4px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
    figure { margin: 12px 0 20px; page-break-inside: avoid; }
    figure img { width: 100%; border: 1px solid #cbd5e1; border-radius: 8px; display: block; }
    figcaption { color: #64748b; font-size: 11px; margin-top: 4px; text-align: center; }
    h2 + p:has(+ figure), h3 + p:has(+ figure) { page-break-after: avoid; }
  </style>
</head>
<body>${body}</body>
</html>`;

await writeFile(htmlPath, html);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto(`file://${htmlPath}`, { waitUntil: "load" });
await page.pdf({
  path: pdfPath,
  format: "A4",
  printBackground: true,
  displayHeaderFooter: true,
  headerTemplate: "<div></div>",
  footerTemplate: "<div style='width:100%;font-size:9px;color:#64748b;text-align:center;'>WaysLeader AI 系統使用手冊｜<span class='pageNumber'></span>/<span class='totalPages'></span></div>",
  margin: { top: "16mm", right: "14mm", bottom: "18mm", left: "14mm" },
});
await browser.close();
console.log(`Wrote ${pdfPath}`);
