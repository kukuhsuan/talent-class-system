import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const docsDir = path.join(root, "docs");
fs.mkdirSync(docsDir, { recursive: true });

const logoPath = path.join(root, "public", "upbear-logo.png");
const logoData = fs.readFileSync(logoPath).toString("base64");

const width = 1240;
const height = 1754;
const scores = [
  { label: "體能", value: 5 },
  { label: "協調", value: 4 },
  { label: "專注", value: 5 },
  { label: "表達", value: 4 },
  { label: "合作", value: 5 },
  { label: "自信", value: 4 },
];

function radar() {
  const cx = 620;
  const cy = 805;
  const maxRadius = 195;
  const labelRadius = 260;
  const polygon = scores.map((score, index) => {
    const angle = -Math.PI / 2 + (index * Math.PI * 2) / scores.length;
    const radius = (score.value / 5) * maxRadius;
    return `${cx + Math.cos(angle) * radius},${cy + Math.sin(angle) * radius}`;
  }).join(" ");
  const rings = [1, 2, 3, 4, 5].map((level) => {
    const radius = (level / 5) * maxRadius;
    const points = scores.map((_score, index) => {
      const angle = -Math.PI / 2 + (index * Math.PI * 2) / scores.length;
      return `${cx + Math.cos(angle) * radius},${cy + Math.sin(angle) * radius}`;
    }).join(" ");
    return `<polygon points="${points}" fill="none" stroke="#D9C8A8" stroke-width="2" stroke-dasharray="8 8"/>`;
  }).join("");
  const axes = scores.map((_score, index) => {
    const angle = -Math.PI / 2 + (index * Math.PI * 2) / scores.length;
    return `<line x1="${cx}" y1="${cy}" x2="${cx + Math.cos(angle) * maxRadius}" y2="${cy + Math.sin(angle) * maxRadius}" stroke="#D9C8A8" stroke-width="2"/>`;
  }).join("");
  const labels = scores.map((score, index) => {
    const angle = -Math.PI / 2 + (index * Math.PI * 2) / scores.length;
    const x = cx + Math.cos(angle) * labelRadius;
    const y = cy + Math.sin(angle) * labelRadius;
    return `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="middle" class="radar-label">${score.label} ${score.value}</text>`;
  }).join("");
  return `${rings}${axes}<polygon points="${polygon}" fill="#D9C08C" opacity="0.55" stroke="#B68A4C" stroke-width="6"/>${scores.map((score, index) => {
    const angle = -Math.PI / 2 + (index * Math.PI * 2) / scores.length;
    const radius = (score.value / 5) * maxRadius;
    return `<circle cx="${cx + Math.cos(angle) * radius}" cy="${cy + Math.sin(angle) * radius}" r="8" fill="#B68A4C"/>`;
  }).join("")}${labels}`;
}

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <style>
    .font { font-family: "PingFang TC", "Microsoft JhengHei", "Noto Sans TC", Arial, sans-serif; }
    .title { font-size: 68px; font-weight: 900; fill: #ffffff; letter-spacing: 2px; }
    .eyebrow { font-size: 20px; font-weight: 700; fill: #dbeafe; letter-spacing: 7px; }
    .card-label { font-size: 28px; font-weight: 900; fill: #111827; }
    .card-value { font-size: 40px; font-weight: 900; fill: #0756B7; }
    .section-title { font-size: 48px; font-weight: 900; fill: #111827; }
    .radar-label { font-family: "PingFang TC", "Microsoft JhengHei", Arial, sans-serif; font-size: 25px; font-weight: 800; fill: #1f2937; }
    .comment { font-size: 34px; font-weight: 650; fill: #1f2937; }
    .meta { font-size: 23px; font-weight: 600; fill: #64748b; }
  </style>
  <rect width="1240" height="1754" fill="#f1f5f9"/>
  <rect x="0" y="0" width="1240" height="1754" fill="#ffffff"/>
  <g class="font">
    <rect x="36" y="36" width="1168" height="265" fill="#0756B7"/>
    <image href="data:image/png;base64,${logoData}" x="92" y="78" width="170" height="170" preserveAspectRatio="xMidYMid meet"/>
    <text x="310" y="130" class="eyebrow">WAYSLEADER AI LEARNING OUTCOME REPORT</text>
    <text x="310" y="218" class="title">專業運動素養發展報告</text>

    <rect x="84" y="340" width="326" height="128" rx="26" fill="#F5F8FF"/>
    <text x="112" y="392" class="card-label">孩子姓名</text>
    <text x="112" y="445" class="card-value">王小宇</text>

    <rect x="457" y="340" width="326" height="128" rx="26" fill="#F8F3E8"/>
    <text x="485" y="392" class="card-label">課程名稱</text>
    <text x="485" y="445" class="card-value">體能遊戲</text>

    <rect x="830" y="340" width="326" height="128" rx="26" fill="#F5F8FF"/>
    <text x="858" y="392" class="card-label">園所名稱</text>
    <text x="858" y="445" class="card-value" style="font-size:33px">陽光森林幼兒園</text>

    <text x="84" y="550" class="section-title">三大核心發展指標</text>
    <rect x="900" y="500" width="256" height="58" rx="29" fill="#F3E7D0"/>
    <text x="1028" y="540" text-anchor="middle" style="font-size:28px;font-weight:900;fill:#6E4C1E">活力成長證書</text>
    ${radar()}

    <rect x="84" y="1120" width="368" height="76" rx="28" fill="#0756B7"/>
    <text x="268" y="1170" text-anchor="middle" style="font-size:34px;font-weight:800;fill:#ffffff">教練專業觀察與建議</text>
    <path d="M84 1192 H1156 Q1190 1192 1190 1226 V1392 Q1190 1426 1156 1426 H118 Q84 1426 84 1392 Z" fill="#E8D9BC"/>
    <text x="132" y="1260" class="comment">孩子在體能遊戲課程中展現良好的參與度與學習動機，能跟隨</text>
    <text x="132" y="1320" class="comment">指令完成暖身、跑跳與協調挑戰。課堂中專注力穩定，面對新</text>
    <text x="132" y="1380" class="comment">任務願意嘗試，也能與同伴合作完成活動，整體表現持續進步。</text>

    <text x="84" y="1500" class="meta">園所：陽光森林幼兒園</text>
    <text x="84" y="1544" class="meta">授課老師：紀瑞琳</text>
    <text x="84" y="1588" class="meta">日期：2026年6月17日</text>
    <text x="1156" y="1576" text-anchor="end" style="font-size:52px;font-weight:900;fill:#0756B7">WaysLeader AI</text>
  </g>
</svg>`;

const svgPath = path.join(docsDir, "certificate-sample.svg");
const pngPath = path.join(docsDir, "certificate-sample.png");
const htmlPath = path.join(docsDir, "certificate-sample.html");

fs.writeFileSync(svgPath, svg, "utf8");
await sharp(Buffer.from(svg)).png().toFile(pngPath);
fs.writeFileSync(htmlPath, `<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8" />
  <title>WaysLeader AI 證書樣張</title>
  <style>
    body { margin: 0; background: #e5e7eb; display: grid; place-items: center; padding: 24px; }
    img { width: min(100%, 794px); background: white; box-shadow: 0 12px 36px rgba(15, 23, 42, .18); }
    @media print {
      @page { size: A4; margin: 0; }
      body { padding: 0; background: white; }
      img { width: 210mm; height: 297mm; box-shadow: none; }
    }
  </style>
</head>
<body>
  <img src="./certificate-sample.svg" alt="WaysLeader AI 證書樣張" />
</body>
</html>
`, "utf8");

console.log(`created ${svgPath}`);
console.log(`created ${pngPath}`);
console.log(`created ${htmlPath}`);
