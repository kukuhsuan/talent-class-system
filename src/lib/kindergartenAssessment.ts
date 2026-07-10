export const ASSESSMENT_GROUPS = [
  { title: "身體能力", items: ["爆發力", "協調性", "平衡感", "敏捷性"] },
  { title: "學習能力", items: ["專注力", "規則理解", "指令反應"] },
  { title: "團隊能力", items: ["團隊合作", "自信表現", "情緒控制"] },
] as const;

export const ASSESSMENT_ITEMS = ASSESSMENT_GROUPS.flatMap((group) => group.items);

export type AssessmentScores = Record<string, number>;

export function emptyScores(): AssessmentScores {
  return Object.fromEntries(ASSESSMENT_ITEMS.map((item) => [item, 3]));
}

export function normalizeScores(value: unknown): AssessmentScores {
  const base = emptyScores();
  if (!value || typeof value !== "object") return base;
  for (const item of ASSESSMENT_ITEMS) {
    const n = Number((value as Record<string, unknown>)[item]);
    base[item] = Number.isFinite(n) ? Math.min(5, Math.max(1, Math.round(n))) : 3;
  }
  return base;
}

export function scoreAverage(scores: AssessmentScores) {
  const values = ASSESSMENT_ITEMS.map((item) => scores[item] ?? 3);
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function strongestItems(scores: AssessmentScores, count = 2) {
  return [...ASSESSMENT_ITEMS]
    .sort((a, b) => (scores[b] ?? 0) - (scores[a] ?? 0))
    .slice(0, count);
}

export function growthTitle(scores: AssessmentScores) {
  const strongest = strongestItems(scores, 1)[0];
  if (strongest === "專注力") return "專注力小達人";
  if (strongest === "團隊合作") return "團隊合作小明星";
  if (["爆發力", "敏捷性", "協調性", "平衡感"].includes(strongest)) return "小小運動健將";
  if (strongest === "自信表現") return "自信閃亮小明星";
  if (strongest === "規則理解") return "規則理解小高手";
  return "優比熊運動小健將";
}

export function generateGrowthComment(childName: string, courseName: string, scores: AssessmentScores) {
  const avg = scoreAverage(scores);
  const [first, second] = strongestItems(scores, 2);
  const name = childFriendlyName(childName);
  const course = courseName.trim() || "才藝課程";
  const template = assessmentCourseTemplate(course);
  const tone = avg >= 4.3
    ? template.strongOpening
    : avg >= 3.2
      ? template.steadyOpening
      : template.growingOpening;
  const abilityOne = template.abilities.includes(first) ? first : template.abilities[0];
  const abilityTwo = template.abilities.includes(second) && second !== abilityOne ? second : template.abilities.find((item) => item !== abilityOne) ?? second;
  const versions = [
    `${name}這學期在${course}中${tone}。其中「${abilityOne}」與「${abilityTwo}」的表現很不錯，${template.observation}。接下來多練習${template.suggestion}，相信${template.shortGoal}會越來越穩定唷！`,
    `這學期的${course}課裡，${name}在「${abilityOne}」和「${abilityTwo}」方面進步得很明顯。${template.observation}，也能${tone}。持續加強${template.suggestion}，會讓${template.shortGoal}更有自信！`,
    `${name}上${course}時很願意跟著老師一起嘗試，現在已經${tone}。課堂上最亮眼的是「${abilityOne}」與「${abilityTwo}」，${template.observation}。之後再多練習${template.suggestion}，表現一定會更自然唷！`,
    `從這學期的${course}活動中，可以看見${name}慢慢累積自信。「${abilityOne}」和「${abilityTwo}」的表現尤其突出；課堂中，${template.observation}。建議繼續練習${template.suggestion}，讓${template.shortGoal}持續進步！`,
    `${name}在${course}課堂中的參與越來越穩定，尤其「${abilityOne}」與「${abilityTwo}」有很好的表現。活動中${template.observation}。整體來說，${tone}，若能持續練習${template.suggestion}，還會有更多成長唷！`,
    `老師這學期看到${name}在${course}中有不少進步，已經${tone}。「${abilityOne}」和「${abilityTwo}」方面特別亮眼；課堂中，${template.observation}。期待透過${template.suggestion}的練習，讓${template.shortGoal}越來越好！`,
  ];

  return versions[stableCommentVersion(childName, courseName, scores, versions.length)];
}

function stableCommentVersion(childName: string, courseName: string, scores: AssessmentScores, count: number) {
  const scoreKey = ASSESSMENT_ITEMS.map((item) => scores[item] ?? 3).join("");
  const key = `${childName.trim()}|${courseName.trim()}|${scoreKey}`;
  let hash = 0;
  for (const character of key) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return hash % count;
}

function childFriendlyName(childName: string) {
  const name = childName.trim();
  if (!name) return "孩子";
  const compact = name.replace(/\s+/g, "");
  if (/^[\u3400-\u9fff]+$/.test(compact) && compact.length >= 3) return compact.slice(-2);
  return name;
}

type AssessmentCourseTemplate = {
  strongOpening: string;
  steadyOpening: string;
  growingOpening: string;
  abilities: string[];
  observation: string;
  suggestion: string;
  shortGoal: string;
  closing: string;
};

function assessmentCourseKind(courseName: string) {
  const text = courseName.toLowerCase();
  if (text.includes("足球")) return "football";
  if (text.includes("冰壺") || text.includes("地板冰壺") || text.includes("小冰壺")) return "curling";
  if (text.includes("籃球")) return "basketball";
  if (text.includes("舞蹈") || text.includes("mv") || text.includes("律動") || text.includes("街舞") || text.includes("hiphop")) return "dance";
  if (text.includes("棒球") || text.includes("樂樂棒球") || text.includes("t-ball") || text.includes("tball")) return "baseball";
  if (text.includes("桌球") || text.includes("匹克球") || text.includes("拍球")) return "racket";
  if (text.includes("正音") || text.includes("注音") || text.includes("ㄅㄆㄇ") || text.includes("拼音")) return "phonics";
  if (text.includes("體能") || text.includes("體適能") || text.includes("幼兒體能") || text.includes("運動遊戲")) return "fitness";
  return "general";
}

function assessmentCourseTemplate(courseName: string): AssessmentCourseTemplate {
  const templates: Record<string, AssessmentCourseTemplate> = {
    football: {
      strongOpening: "能穩定跟上足球活動節奏，對帶球、跑位和簡單規則越來越熟悉",
      steadyOpening: "慢慢熟悉足球活動節奏，能嘗試完成帶球、跑動和團隊練習",
      growingOpening: "持續累積足球活動經驗，正在建立跑動與球感的信心",
      abilities: ["敏捷性", "協調性", "指令反應", "團隊合作", "規則理解", "自信表現"],
      observation: "願意跟著指令跑動、轉換方向，並嘗試和同伴一起完成任務",
      suggestion: "腳步控制、方向轉換和帶球穩定度",
      shortGoal: "跑動能力和團隊互動",
      closing: "持續在足球活動中累積自信，讓跑動能力和團隊互動越來越進步。",
    },
    curling: {
      strongOpening: "能穩定投入冰壺活動，對投擲方式、目標位置和遊戲規則越來越掌握",
      steadyOpening: "慢慢熟悉冰壺投擲方式，能跟著老師完成瞄準與輪流等待",
      growingOpening: "正在累積冰壺活動經驗，透過老師引導練習專注和出手控制",
      abilities: ["專注力", "協調性", "規則理解", "指令反應", "情緒控制", "團隊合作"],
      observation: "能嘗試控制力道、觀察目標位置，也願意遵守輪流等待的規則",
      suggestion: "出手穩定度、力道控制和方向判斷",
      shortGoal: "專注力和投擲表現",
      closing: "在遊戲中累積成功經驗，讓專注力和規則理解慢慢提升。",
    },
    basketball: {
      strongOpening: "能穩定參與籃球練習，對拍球、投籃和跑動活動越來越有信心",
      steadyOpening: "慢慢熟悉拍球和投籃動作，也越來越願意參與課堂練習",
      growingOpening: "正在建立籃球課的參與感，透過練習累積拍球與投籃經驗",
      abilities: ["協調性", "指令反應", "敏捷性", "團隊合作", "自信表現", "專注力"],
      observation: "能跟著老師的節奏完成活動，嘗試控制球和調整身體動作",
      suggestion: "拍球穩定度、手眼協調和身體控制",
      shortGoal: "籃球動作和課堂參與",
      closing: "繼續在籃球課中累積自信，讓運動能力和團隊互動都慢慢進步。",
    },
    fitness: {
      strongOpening: "能穩定完成體能關卡，身體控制和活動參與都很有進步",
      steadyOpening: "慢慢累積體能活動經驗，也越來越能跟著老師完成不同關卡",
      growingOpening: "正在熟悉體能課的活動節奏，透過鼓勵逐步建立參與信心",
      abilities: ["平衡感", "協調性", "爆發力", "敏捷性", "指令反應", "專注力"],
      observation: "在平衡、跳躍、跑動或關卡活動中，能嘗試調整自己的身體",
      suggestion: "核心力量、四肢肌力和動作穩定度",
      shortGoal: "身體控制和活動參與",
      closing: "在穩定練習和鼓勵下，持續提升運動能力與課堂參與度。",
    },
    dance: {
      strongOpening: "能享受音樂和舞蹈活動，節奏感與動作表現越來越自然",
      steadyOpening: "慢慢熟悉音樂節奏，也越來越願意跟著老師一起完成動作",
      growingOpening: "正在建立舞蹈課的參與信心，透過模仿慢慢熟悉動作",
      abilities: ["自信表現", "協調性", "專注力", "指令反應", "團隊合作", "情緒控制"],
      observation: "能嘗試跟著音樂完成舞步，並在團體活動中練習表達自己",
      suggestion: "動作記憶、節奏穩定和身體延展",
      shortGoal: "節奏感和肢體表現",
      closing: "持續在音樂和動作中累積自信，越來越敢展現自己。",
    },
    baseball: {
      strongOpening: "能穩定參與棒球活動，對揮棒、接球和投擲練習越來越熟悉",
      steadyOpening: "慢慢熟悉揮棒、接球和投擲練習，也越來越能跟上課堂活動",
      growingOpening: "正在累積棒球活動經驗，透過老師引導嘗試不同動作",
      abilities: ["協調性", "指令反應", "敏捷性", "規則理解", "團隊合作", "自信表現"],
      observation: "願意嘗試揮棒、接球或投擲挑戰，並理解基本活動規則",
      suggestion: "揮棒穩定度、接球判斷和投擲力量",
      shortGoal: "棒球動作和團隊合作",
      closing: "持續在棒球活動中累積成功經驗，讓運動能力和團隊合作慢慢進步。",
    },
    racket: {
      strongOpening: "能穩定投入擊球練習，對握拍、方向判斷和反應越來越熟悉",
      steadyOpening: "慢慢熟悉握拍和擊球方式，也越來越能跟著老師完成練習",
      growingOpening: "正在累積擊球活動經驗，透過遊戲練習手眼協調",
      abilities: ["專注力", "協調性", "指令反應", "敏捷性", "規則理解", "自信表現"],
      observation: "能嘗試判斷球的方向，並調整握拍和出手位置",
      suggestion: "擊球穩定度、反應速度和方向控制",
      shortGoal: "擊球控制和學習信心",
      closing: "持續累積練習經驗，讓動作控制和學習信心慢慢提升。",
    },
    phonics: {
      strongOpening: "能穩定投入正音練習，對注音辨識和口語表達越來越有信心",
      steadyOpening: "慢慢熟悉注音符號，也越來越能跟著老師一起練習發音",
      growingOpening: "正在建立正音課的學習節奏，透過引導慢慢嘗試開口練習",
      abilities: ["專注力", "指令反應", "規則理解", "自信表現", "情緒控制", "團隊合作"],
      observation: "願意聽音、辨識符號並嘗試開口，課堂互動也逐步增加",
      suggestion: "容易混淆的音、拼讀練習和發音清晰度",
      shortGoal: "發音清晰度和口語表達",
      closing: "持續在穩定練習中累積信心，讓注音學習越來越順。",
    },
    general: {
      strongOpening: "能穩定投入課堂活動，參與度和學習表現都持續累積",
      steadyOpening: "慢慢累積課程經驗，也越來越能跟著老師的引導參與活動",
      growingOpening: "持續熟悉課堂節奏，正在透過老師引導建立參與信心",
      abilities: ["協調性", "專注力", "指令反應", "團隊合作", "自信表現", "規則理解"],
      observation: "願意嘗試不同練習，並在活動中累積課堂規則和互動經驗",
      suggestion: "動作穩定度、課堂專注和持續參與",
      shortGoal: "能力表現和課堂互動",
      closing: "持續在課程中累積信心，讓能力表現和團隊互動慢慢進步。",
    },
  };

  return templates[assessmentCourseKind(courseName)];
}

export function groupAverages(scores: AssessmentScores) {
  return ASSESSMENT_GROUPS.map((group) => {
    const values = group.items.map((item) => scores[item] ?? 3);
    return {
      label: group.title,
      value: Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1)),
    };
  });
}

export function parseScores(raw: string | null | undefined) {
  if (!raw) return emptyScores();
  try {
    return normalizeScores(JSON.parse(raw));
  } catch {
    return emptyScores();
  }
}

export function assessmentSemester(dateValue: string | Date) {
  const date = new Date(dateValue);
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  if (month >= 3 && month <= 6) return `${year}春季學期`;
  if (month >= 9 || month === 1) return `${month === 1 ? year - 1 : year}秋季學期`;
  return `${year}學期`;
}

export function assessmentSemesterRange(dateValue: string | Date) {
  const date = new Date(dateValue);
  const year = date.getFullYear();
  const month = date.getMonth() + 1;

  if (month >= 3 && month <= 6) {
    return {
      start: new Date(year, 2, 1),
      end: new Date(year, 6, 1),
    };
  }

  if (month >= 9) {
    return {
      start: new Date(year, 8, 1),
      end: new Date(year + 1, 1, 1),
    };
  }

  if (month === 1) {
    return {
      start: new Date(year - 1, 8, 1),
      end: new Date(year, 1, 1),
    };
  }

  const start = new Date(year, month - 1, 1);
  return {
    start,
    end: new Date(year, month, 1),
  };
}
