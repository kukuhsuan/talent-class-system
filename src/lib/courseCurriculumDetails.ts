export type CanonicalLessonDetail = {
  lesson: number;
  title: string;
  focus: string;
  skills: string[];
};

// 來源：體能與足球課程大綱.pdf，第 1–3 頁（體能課 L1–L24）。
export const FITNESS_LESSON_DETAILS: CanonicalLessonDetail[] = [
  { lesson: 1, title: "聽聲辨位", focus: "聽聲音找位置，練習聽指令與安全規則。", skills: ["敏捷反應"] },
  { lesson: 2, title: "華麗舞步", focus: "左右移動、節奏變換，讓身體更靈活。", skills: ["腳步協調"] },
  { lesson: 3, title: "動物旅行", focus: "模仿動物走路，練習跨、跳、鑽與平衡。", skills: ["跨越跳躍"] },
  { lesson: 4, title: "來去自如", focus: "三角錐折返跑，訓練加速、煞車與轉向。", skills: ["速度折返"] },
  { lesson: 5, title: "萬里長城", focus: "聽哨音完成任務，學習等待、輪流與規則。", skills: ["秩序合作"] },
  { lesson: 6, title: "麥可喬登", focus: "球類拋接與拍球，提升控制力與反應。", skills: ["手眼協調"] },
  { lesson: 7, title: "官兵抓強盜", focus: "追逐與閃躲遊戲，提升反應與空間感。", skills: ["敏捷追逐"] },
  { lesson: 8, title: "巨猩喬揚", focus: "繩梯爬行與支撐，訓練核心與四肢力量。", skills: ["肌耐力"] },
  { lesson: 9, title: "動物園", focus: "用不同姿勢移動，練習協調與創意動作。", skills: ["身體控制"] },
  { lesson: 10, title: "動物旅行進階", focus: "欄架組合挑戰，練習動作銜接與安全落地。", skills: ["連續動作"] },
  { lesson: 11, title: "小小守門員", focus: "踢球與守門遊戲，練習目標感與反應。", skills: ["方向感"] },
  { lesson: 12, title: "彈簧腿", focus: "高低欄架跳躍，訓練彈跳與落地穩定。", skills: ["跳躍爆發"] },
  { lesson: 13, title: "華麗舞步進階", focus: "前後左右變換，提升節奏與敏捷度。", skills: ["變向移動"] },
  { lesson: 14, title: "步步高升", focus: "跳格、跨步與快速腳步，練習節奏控制。", skills: ["繩梯速度"] },
  { lesson: 15, title: "萬里長城進階", focus: "分組完成挑戰，培養合作與任務感。", skills: ["團隊任務"] },
  { lesson: 16, title: "速度訓練", focus: "短跑、折返與停住，挑戰速度與專注力。", skills: ["反應速度"] },
  { lesson: 17, title: "平衡與協調", focus: "單腳站、平衡走，提升核心與身體穩定。", skills: ["穩定控制"] },
  { lesson: 18, title: "爆發力訓練", focus: "跑跳綜合挑戰，練習瞬間出力與控制。", skills: ["跳躍力量"] },
  { lesson: 19, title: "小小障礙王", focus: "跨越、鑽爬、跳躍串聯，提升動作整合。", skills: ["綜合闖關"] },
  { lesson: 20, title: "團隊接力賽", focus: "分組接力，練習等待、交棒與團隊默契。", skills: ["合作速度"] },
  { lesson: 21, title: "平衡木挑戰", focus: "走線、轉身、停住，練習穩定與專注。", skills: ["平衡專注"] },
  { lesson: 22, title: "敏捷反應王", focus: "顏色與哨音任務，訓練快速判斷。", skills: ["聽覺反應"] },
  { lesson: 23, title: "大肌肉闖關", focus: "爬、跳、推、拉任務，提升身體力量。", skills: ["肌耐力"] },
  { lesson: 24, title: "綜合體能挑戰", focus: "結合速度、平衡、跳躍與協調完成挑戰。", skills: ["全身協調"] },
];

// 來源：體能與足球課程大綱.pdf，第 4–5 頁（足球課 L1–L20）。
export const FOOTBALL_LESSON_DETAILS: CanonicalLessonDetail[] = [
  { lesson: 1, title: "足球初體驗", focus: "點球、內側互踢，先認識球與腳的控制。", skills: ["基礎球感"] },
  { lesson: 2, title: "球感再熟悉", focus: "點球與炒蛋練習，建立穩定碰球經驗。", skills: ["基礎球感"] },
  { lesson: 3, title: "靈活小腳丫", focus: "移動式點球，練習小腳控制與反應。", skills: ["動態球感"] },
  { lesson: 4, title: "移動高手", focus: "側拉球、障礙拉球，學習轉向與閃避。", skills: ["方向轉換"] },
  { lesson: 5, title: "盤球迷宮", focus: "S 型盤球，培養方向感與身體協調。", skills: ["基礎運球"] },
  { lesson: 6, title: "紅綠燈運球", focus: "W 型盤球與紅綠燈遊戲，練習煞車。", skills: ["進階控球"] },
  { lesson: 7, title: "城堡攻防戰", focus: "攻打三角錐城堡，練習瞄準與腳力。", skills: ["定點射門"] },
  { lesson: 8, title: "炸彈客來襲", focus: "踢動態球，提升判斷、反應與準確度。", skills: ["動態射門"] },
  { lesson: 9, title: "傳球小夥伴", focus: "兩人一組傳接球，學習合作與等待。", skills: ["合作傳球"] },
  { lesson: 10, title: "超級運轉手", focus: "直線運球加射門，完成連續動作。", skills: ["運球射門"] },
  { lesson: 11, title: "煞車高手", focus: "移動中停球，練習控制速度與重心。", skills: ["停球控制"] },
  { lesson: 12, title: "彈地停球", focus: "彈地球停球，訓練觀察與腳部控制。", skills: ["反應停球"] },
  { lesson: 13, title: "足球接力賽", focus: "運球繞錐接力，培養速度與團隊感。", skills: ["團隊競速"] },
  { lesson: 14, title: "黃金左腳", focus: "射門挑戰，練習方向、角度與力量。", skills: ["精準射門"] },
  { lesson: 15, title: "1對1決鬥", focus: "搶球加射門，體驗攻守與運動精神。", skills: ["對抗觀念"] },
  { lesson: 16, title: "傳球射門", focus: "兩人傳球後射門，學習默契與合作。", skills: ["團隊配合"] },
  { lesson: 17, title: "2碼射門", focus: "近距離射門，建立自信與成功經驗。", skills: ["目標感"] },
  { lesson: 18, title: "障礙射門", focus: "加入障礙物，練習避開路線再射門。", skills: ["射門變化"] },
  { lesson: 19, title: "小型對抗賽", focus: "分組搶球射門，學習規則與合作。", skills: ["實戰體驗"] },
  { lesson: 20, title: "成果挑戰賽", focus: "球感、運球、傳球、射門一次完成。", skills: ["綜合展現"] },
];

export const CANONICAL_LESSON_DETAILS: Record<string, CanonicalLessonDetail[]> = {
  體能: FITNESS_LESSON_DETAILS,
  足球: FOOTBALL_LESSON_DETAILS,
};
