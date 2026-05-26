import { courseLabel } from "@/lib/courseMeta";

export type LessonProfile = {
  course: string;
  lesson?: number;
  title: string;
  theme: string;
  purpose: string;
  movementFocus: string[];
  skillFocus: string[];
  learningPoints: string[];
  parentSummary: string;
  classFeedback: {
    active: string;
    steady: string;
    practice: string;
  };
};

function cleanProgressTitle(progress: string) {
  return progress
    .replace(/^第\s*\d+\s*堂\s*/u, "")
    .replace(/^[:：｜|\-\s]+/u, "")
    .trim();
}

export function parseLessonNumber(progress: string) {
  const match = progress.match(/第\s*(\d+)\s*堂/u);
  return match ? Number(match[1]) : undefined;
}

function includesAny(text: string, words: string[]) {
  return words.some((word) => text.includes(word));
}

function profileKey(course: string, lesson?: number) {
  return lesson ? `${course}:${lesson}` : "";
}

const EXACT_LESSONS: Record<string, Omit<LessonProfile, "course">> = {
  "足球:1": {
    lesson: 1,
    title: "點球、炒蛋",
    theme: "基本球感與腳部控制",
    purpose: "讓孩子先熟悉足球和腳部觸球方式，建立願意碰球、控制球的第一步。",
    movementFocus: ["用腳控制球的位置", "練習輕重力道", "熟悉球在腳邊移動"],
    skillFocus: ["腳部控制", "身體協調", "專注觀察"],
    learningPoints: ["熟悉足球觸感", "練習腳部控球", "建立基礎球感"],
    parentSummary:
      "今天從點球與炒蛋遊戲開始，孩子先熟悉足球在腳邊移動的感覺，練習用不同力道控制球的位置，也慢慢建立基本球感與腳步協調。",
    classFeedback: {
      active: "孩子願意主動碰球與嘗試動作，對足球活動有很好的開場參與。",
      steady: "孩子能跟著老師節奏完成基本觸球，正在建立穩定球感。",
      practice: "孩子還在熟悉球感與腳部控制，後續會用更多遊戲引導練習。",
    },
  },
  "足球:7": {
    lesson: 7,
    title: "球感控制與敏捷訓練",
    theme: "控球穩定與敏捷移動",
    purpose: "透過連續控球和方向變化，提升孩子的反應速度、腳步敏捷與移動穩定度。",
    movementFocus: ["連續控球不離腳", "方向變換反應", "移動中的身體平衡"],
    skillFocus: ["控球穩定", "反應速度", "敏捷移動"],
    learningPoints: ["提升控球穩定度", "練習快速反應", "加強敏捷移動"],
    parentSummary:
      "今天孩子練習在移動中控制足球，透過方向變換與敏捷挑戰，學習讓球保持在可控制範圍內，也加強反應速度與身體平衡。",
    classFeedback: {
      active: "孩子在敏捷挑戰中很投入，能快速嘗試不同方向的控球變化。",
      steady: "孩子能依照老師指令完成控球路線，穩定度逐步提升。",
      practice: "孩子還需要多練習移動中的控球節奏，會持續用關卡活動建立穩定感。",
    },
  },
  "足球:19": {
    lesson: 19,
    title: "1vs1 搶球射門",
    theme: "對抗判斷與射門決策",
    purpose: "讓孩子在遊戲對抗中練習觀察、判斷與出腳時機，並把控球轉化成射門行動。",
    movementFocus: ["觀察對手位置", "判斷搶球時機", "完成帶球後射門"],
    skillFocus: ["對抗反應", "判斷能力", "團隊競賽"],
    learningPoints: ["練習搶球判斷", "提升對抗反應", "完成射門挑戰"],
    parentSummary:
      "今天進入 1vs1 搶球射門挑戰，孩子練習觀察對手位置、判斷出腳時機，並在取得球權後完成射門，從遊戲中培養反應與競賽感。",
    classFeedback: {
      active: "孩子在對抗挑戰中很有企圖心，願意嘗試搶球與射門。",
      steady: "孩子能理解遊戲規則，逐步掌握判斷與射門節奏。",
      practice: "孩子仍在熟悉對抗中的判斷時機，後續會繼續練習觀察與反應。",
    },
  },
};

const COURSE_DEFAULTS: Record<string, Omit<LessonProfile, "course" | "lesson" | "title">> = {
  足球: {
    theme: "足球基礎動作與遊戲挑戰",
    purpose: "透過足球遊戲建立球感、腳步協調與團隊互動。",
    movementFocus: ["控制足球方向", "練習腳步協調", "完成遊戲挑戰"],
    skillFocus: ["腳步協調", "反應能力", "團隊合作"],
    learningPoints: ["練習足球控制", "提升腳步反應", "培養團隊互動"],
    parentSummary: "今天透過足球遊戲練習球感與動作控制，孩子在挑戰中熟悉腳步節奏，也學習和同伴一起完成任務。",
    classFeedback: {
      active: "孩子願意投入活動並主動嘗試，課堂互動很自然。",
      steady: "孩子能跟著老師引導完成練習，動作穩定度逐步累積。",
      practice: "孩子還在熟悉動作節奏，會透過遊戲持續建立信心。",
    },
  },
  籃球: {
    theme: "球感控制與手眼協調",
    purpose: "透過運球與傳接活動，建立手部控制、節奏感與輪流等待。",
    movementFocus: ["控制球的彈跳節奏", "練習傳接反應", "移動中保持穩定"],
    skillFocus: ["手眼協調", "節奏感", "輪流等待"],
    learningPoints: ["練習球感控制", "提升手眼協調", "學習輪流合作"],
    parentSummary: "今天透過籃球遊戲練習球感與手部控制，孩子在運球、傳接與互動中累積節奏感和合作經驗。",
    classFeedback: {
      active: "孩子願意主動碰球與嘗試挑戰，參與度很好。",
      steady: "孩子能跟著節奏完成基本練習，手眼協調逐步提升。",
      practice: "孩子仍在熟悉球感與節奏，後續會用遊戲方式持續練習。",
    },
  },
  高爾夫: {
    theme: "擊球控制與專注穩定",
    purpose: "透過推桿與目標挑戰，練習控制方向、力道與身體穩定。",
    movementFocus: ["控制擊球方向", "調整擊球力道", "保持身體穩定"],
    skillFocus: ["專注力", "動作控制", "耐心"],
    learningPoints: ["控制擊球方向與力道", "練習專注與身體穩定", "培養耐心與動作控制"],
    parentSummary: "今天透過擊球挑戰練習方向與力道控制，孩子在瞄準、揮桿與等待中培養專注和穩定動作。",
    classFeedback: {
      active: "孩子願意嘗試瞄準與擊球，能投入每一次挑戰。",
      steady: "孩子能依照老師提醒調整動作，專注與穩定度都有累積。",
      practice: "孩子還在熟悉力道控制，後續會用目標遊戲持續練習。",
    },
  },
  棒球: {
    theme: "傳接反應與投打基礎",
    purpose: "透過傳接球與打擊遊戲，建立觀察、反應和基本投打動作。",
    movementFocus: ["觀察球的方向", "練習接球反應", "完成投打動作"],
    skillFocus: ["反應力", "觀察力", "手眼協調"],
    learningPoints: ["練習傳接球反應", "建立投打基本動作", "培養觀察與判斷"],
    parentSummary: "今天透過棒球遊戲練習觀察球路與傳接反應，孩子在投打活動中累積手眼協調和動作信心。",
    classFeedback: {
      active: "孩子能投入傳接與打擊挑戰，願意嘗試不同動作。",
      steady: "孩子能跟著老師指令完成基本動作，反應與觀察逐漸穩定。",
      practice: "孩子仍在熟悉球路判斷，會持續用互動遊戲累積經驗。",
    },
  },
  冰壺: {
    theme: "推壺控制與目標判斷",
    purpose: "透過推壺活動練習方向、距離感與策略觀察。",
    movementFocus: ["控制推壺方向", "調整推壺力道", "觀察目標位置"],
    skillFocus: ["專注力", "策略思考", "手眼協調"],
    learningPoints: ["練習推壺方向控制", "學習觀察目標距離", "培養專注與策略思考"],
    parentSummary: "今天透過冰壺目標遊戲練習方向與距離控制，孩子學習觀察目標位置，也在輪流挑戰中培養專注與策略感。",
    classFeedback: {
      active: "孩子對目標挑戰很投入，願意嘗試調整方向與力道。",
      steady: "孩子能依照老師引導完成推壺練習，觀察與控制逐步穩定。",
      practice: "孩子仍在熟悉距離與力道判斷，後續會持續用關卡練習。",
    },
  },
  舞蹈: {
    theme: "節奏律動與肢體表達",
    purpose: "透過節奏與動作組合，建立身體協調、記憶與自信表現。",
    movementFocus: ["跟隨音樂節奏", "完成動作組合", "表達肢體變化"],
    skillFocus: ["肢體協調", "節奏感", "自信表現"],
    learningPoints: ["練習節奏律動", "提升動作記憶", "培養自信表現"],
    parentSummary: "今天透過律動與動作組合練習節奏感，孩子在音樂中熟悉肢體變化，也更敢表達自己。",
    classFeedback: {
      active: "孩子願意跟著音樂動起來，課堂氣氛活潑。",
      steady: "孩子能跟著老師完成動作組合，節奏感逐步建立。",
      practice: "孩子還在熟悉動作記憶，後續會用分段練習增加信心。",
    },
  },
};

function keywordProfile(course: string, lesson: number | undefined, title: string): Partial<LessonProfile> {
  const text = `${course} ${title}`;
  if (includesAny(text, ["射門", "搶球", "1vs1", "對抗", "比賽"])) {
    return {
      theme: "對抗判斷與目標完成",
      purpose: "讓孩子在競賽情境中練習觀察、判斷和完成目標。",
      movementFocus: ["觀察對手與目標", "判斷行動時機", "完成挑戰任務"],
      skillFocus: ["判斷能力", "反應速度", "競賽合作"],
      learningPoints: ["練習判斷時機", "提升對抗反應", "完成目標挑戰"],
      parentSummary: `今天進行「${title}」挑戰，孩子練習觀察情境、判斷行動時機，並把前面累積的動作能力用在遊戲任務中。`,
    };
  }
  if (includesAny(text, ["控球", "球感", "盤球", "運球", "帶球", "切球", "切滾球"])) {
    return {
      theme: "球感控制與移動穩定",
      purpose: "透過連續控制和方向變化，建立穩定球感與移動中的協調。",
      movementFocus: ["控制球的方向", "移動中保持平衡", "依指令變換動作"],
      skillFocus: ["控球穩定", "身體協調", "專注反應"],
      learningPoints: ["控制球的方向與速度", "練習移動中的平衡", "培養專注反應"],
      parentSummary: `今天透過「${title}」活動，孩子練習控制球的方向與速度，也在移動過程中保持平衡和專注。`,
    };
  }
  if (includesAny(text, ["傳球", "接球", "傳接", "投球", "打擊"])) {
    return {
      theme: "傳接反應與合作節奏",
      purpose: "透過傳接互動建立觀察、反應和與同伴配合的節奏。",
      movementFocus: ["觀察球的路線", "做出接球反應", "和同伴完成互動"],
      skillFocus: ["手眼協調", "反應力", "團隊合作"],
      learningPoints: ["練習傳接反應", "提升手眼協調", "學習互相配合"],
      parentSummary: `今天透過「${title}」活動，孩子練習觀察球的路線並做出反應，也在互動中學習等待、輪流和合作。`,
    };
  }
  if (includesAny(text, ["平衡", "跨步", "跳", "敏捷", "跑", "障礙"])) {
    return {
      theme: "肢體協調與敏捷反應",
      purpose: "透過移動關卡建立平衡、節奏與身體控制。",
      movementFocus: ["保持身體平衡", "完成移動關卡", "調整動作速度"],
      skillFocus: ["肢體協調", "敏捷性", "身體控制"],
      learningPoints: ["練習身體平衡", "提升敏捷反應", "完成移動挑戰"],
      parentSummary: `今天透過「${title}」關卡，孩子練習身體平衡與移動協調，也在挑戰中提升反應和動作控制。`,
    };
  }
  if (includesAny(text, ["規則", "指令", "團隊", "合作", "分組"])) {
    return {
      theme: "規則理解與團隊互動",
      purpose: "透過分組任務建立聽指令、遵守規則與合作完成目標。",
      movementFocus: ["聽懂活動規則", "依序完成任務", "和同伴互相配合"],
      skillFocus: ["規則理解", "團隊合作", "情緒控制"],
      learningPoints: ["理解遊戲規則", "練習團隊互動", "學習輪流等待"],
      parentSummary: `今天透過「${title}」活動，孩子練習聽懂規則、輪流等待，也學習和同伴一起完成任務。`,
    };
  }
  if (lesson && lesson >= 16) {
    return {
      theme: "綜合挑戰與成果應用",
      purpose: "把前面學過的動作整合到任務中，培養孩子完成挑戰的信心。",
      movementFocus: ["整合已學動作", "完成連續任務", "嘗試成果挑戰"],
      skillFocus: ["綜合應用", "自信表現", "團隊互動"],
      learningPoints: ["整合已學動作", "完成成果挑戰", "建立運動自信"],
      parentSummary: `今天透過「${title}」活動，孩子把前面累積的動作能力整合運用，也在挑戰中增加自信與參與感。`,
    };
  }
  return {};
}

export function getLessonProfile(courseType: string, progress: string): LessonProfile {
  const course = courseLabel(courseType);
  const lesson = parseLessonNumber(progress);
  const title = cleanProgressTitle(progress) || `${course}課程練習`;
  const exact = EXACT_LESSONS[profileKey(course, lesson)];
  if (exact) return { course, ...exact };

  const defaults = COURSE_DEFAULTS[course] ?? COURSE_DEFAULTS.足球;
  const keyword = keywordProfile(course, lesson, title);
  return {
    course,
    lesson,
    title,
    theme: keyword.theme ?? defaults.theme,
    purpose: keyword.purpose ?? defaults.purpose,
    movementFocus: keyword.movementFocus ?? defaults.movementFocus,
    skillFocus: keyword.skillFocus ?? defaults.skillFocus,
    learningPoints: keyword.learningPoints ?? defaults.learningPoints,
    parentSummary: keyword.parentSummary ?? defaults.parentSummary,
    classFeedback: defaults.classFeedback,
  };
}
