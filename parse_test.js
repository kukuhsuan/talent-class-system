const text = `課程簡介
這是充滿樂趣的高爾夫揮桿基礎與安全練習課程
對象：專為5到6歲活力充沛的幼兒設計 | 時間：約50分鐘

① 無球桿揮桿練習（10分鐘）
活動： 寶貝們先不拿球桿，我們雙手合十，一起練習超帥氣的上桿與送桿分解動作
目標： 讓孩子在沒有壓力的狀態下，輕鬆熟悉揮桿的基本節奏與身體的神奇協調力
重點：
當教練充滿活力地喊出1的時候，寶貝們要優雅地上桿，把手手擺動到右腳的前方
當教練響亮地喊出2的時候，大家要充滿自信地送桿，把手手推出到左腳的前方
教練會溫柔提醒，我們的小腦袋和小腳丫要乖乖保持不動，只需要轉動充滿活力的上半身唷
器材： 這個階段完全無需任何器材

② 有球桿揮桿練習（15分鐘）
活動： 現在寶貝們要拿著專屬球桿，配合教練1和2的口令，進行超帥氣的揮桿練習
目標： 教練會幫助大家建立最正確的握桿姿勢，並展現完美的揮桿協調動作`;

const lines = text.replace(/\\n/g, '\n').split('\n').filter(l => l.trim() !== '');
const blocks = [];
let currentBlock = { type: 'header', content: [] };

for (const line of lines) {
  const trimmed = line.trim();
  const stepMatch = trimmed.match(/^([①-⑩]|\d+\.|步驟\s*\d+[:：]?)\s*(.*)/);
  if (stepMatch) {
    if (currentBlock.content.length > 0 || currentBlock.title) blocks.push(currentBlock);
    currentBlock = { type: 'step', title: trimmed, content: [] };
  } else {
    currentBlock.content.push(trimmed);
  }
}
if (currentBlock.content.length > 0 || currentBlock.title) blocks.push(currentBlock);

for (const block of blocks) {
  if (block.type === 'step') {
    const titleMatch = block.title?.match(/^([①-⑩]|\d+\.|步驟\s*\d+[:：]?)\s*(.*)/);
    const iconText = titleMatch ? titleMatch[1].replace(/\./g, '') : "•";
    const convertedNum = iconText.replace(/[①②③④⑤⑥⑦⑧⑨⑩]/g, (m) => String(m.charCodeAt(0) - 9311));
    console.log(`STEP: [${convertedNum}] ${titleMatch ? titleMatch[2] : block.title}`);
  } else {
    console.log(`HEADER:`, block.content);
  }
}
