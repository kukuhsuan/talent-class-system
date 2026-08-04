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

// 來源：艾倫戴爾-20堂幼兒運動課程進度表.docx.pdf，第 1–2 頁（帶式橄欖球 L1–L20）。
// 教學提醒：以「拔旗代替擒抱」，全程禁止推撞、拉扯衣物或撲倒。
export const FLAG_RUGBY_LESSON_DETAILS: CanonicalLessonDetail[] = [
  { lesson: 1, title: "認識帶式橄欖球", focus: "認識球具、腰帶與場地，學會不推人、不拉衣服。", skills: ["安全意識", "規則理解"] },
  { lesson: 2, title: "持球與護球", focus: "正確持球與雙手護球，練習抱球走、跑與停。", skills: ["手眼協調", "身體控制"] },
  { lesson: 3, title: "基礎跑動", focus: "直線跑、變速與急停，聽指令後快速啟動。", skills: ["反應力", "速度控制"] },
  { lesson: 4, title: "閃躲與變向", focus: "角錐繞行與折返，練習避開防守並保護腰帶。", skills: ["敏捷性", "空間感"] },
  { lesson: 5, title: "拔旗基本動作", focus: "從側面接近、看準腰帶安全拔旗，高舉喊停。", skills: ["專注力", "安全防守"] },
  { lesson: 6, title: "拔旗追逐遊戲", focus: "一對一尾巴追逐，練習追蹤、控距與適時拔旗。", skills: ["反應力", "距離判斷"] },
  { lesson: 7, title: "雙手傳球入門", focus: "胸前傳球練習，面向隊友、看目標再出手。", skills: ["手眼協調", "傳球概念"] },
  { lesson: 8, title: "接球基本動作", focus: "雙手迎球、眼睛看球，從定點接球進到移動接球。", skills: ["專注力", "接球穩定"] },
  { lesson: 9, title: "近距離傳接", focus: "兩人一組短距離傳接，逐步拉開距離控制力量。", skills: ["合作", "力量控制"] },
  { lesson: 10, title: "移動中傳接", focus: "跑到空位停穩接球，體驗傳球與跑動的連結。", skills: ["節奏感", "空間判斷"] },
  { lesson: 11, title: "持球過關挑戰", focus: "結合跑動、變向與護球，完成障礙與安全達陣。", skills: ["敏捷性", "動作整合"] },
  { lesson: 12, title: "認識達陣", focus: "認識達陣區與得分方式，持球跑入並安全停下。", skills: ["目標概念", "規則理解"] },
  { lesson: 13, title: "進攻找空位", focus: "顏色區小組移動，觀察防守位置並跑向空間。", skills: ["觀察力", "進攻概念"] },
  { lesson: 14, title: "防守站位", focus: "面向持球者保持安全距離，跟隨移動封鎖路線。", skills: ["防守概念", "身體控制"] },
  { lesson: 15, title: "一對一攻防", focus: "進攻變向達陣、防守拔旗攔阻，輪流體驗角色。", skills: ["判斷力", "攻防應用"] },
  { lesson: 16, title: "二對一合作", focus: "兩人跑位傳球突破防守，做出傳或跑的選擇。", skills: ["團隊合作", "決策力"] },
  { lesson: 17, title: "小組進攻任務", focus: "三人小組完成起跑、跑位、傳接與達陣流程。", skills: ["溝通", "團隊默契"] },
  { lesson: 18, title: "迷你比賽入門", focus: "縮小場地分組比賽，熟悉開球、攻防與球權交換。", skills: ["規則應用", "運動精神"] },
  { lesson: 19, title: "綜合挑戰賽", focus: "傳準、接球、閃躲、拔旗與達陣闖關複習。", skills: ["綜合能力", "自信心"] },
  { lesson: 20, title: "成果驗收與友誼賽", focus: "基本動作驗收與友誼賽，練習守規則與賽後致意。", skills: ["成果展現", "團隊精神"] },
];

// 來源：艾倫戴爾-20堂幼兒運動課程進度表.docx.pdf，第 5–6 頁（樂樂棒球 L1–L20）。
// 教學提醒：使用安全軟式球具與球座，揮棒時須設置安全區。
export const TEEBALL_LESSON_DETAILS: CanonicalLessonDetail[] = [
  { lesson: 1, title: "禮儀與規則", focus: "認識球棒、球座與壘包，建立揮棒安全區觀念。", skills: ["安全意識", "規則理解"] },
  { lesson: 2, title: "基本概念與場地", focus: "認識內外野與壘包順序，依指令移動就位。", skills: ["空間感", "角色理解"] },
  { lesson: 3, title: "投球基本動作", focus: "側身、抬手、跨步朝目標投球，建立安全投擲。", skills: ["手眼協調", "動作控制"] },
  { lesson: 4, title: "短距離傳接球", focus: "兩人一組近距離傳球，雙手接球後穩定護球。", skills: ["合作", "接球穩定"] },
  { lesson: 5, title: "中長距離投球", focus: "逐步拉開距離，調整出手角度與力量。", skills: ["力量控制", "距離感"] },
  { lesson: 6, title: "壘間傳球", focus: "以壘包為目標傳準與接力，先看目標再傳球。", skills: ["專注力", "傳球準確"] },
  { lesson: 7, title: "內野守備入門", focus: "預備姿勢、移動接球，再把球傳向指定壘包。", skills: ["反應力", "守備概念"] },
  { lesson: 8, title: "守備節律", focus: "準備、移動、接球、傳球，串成連續守備動作。", skills: ["節奏感", "動作連結"] },
  { lesson: 9, title: "守備判斷", focus: "依球的方向與速度判斷位置，選擇接球方式。", skills: ["判斷力", "觀察力"] },
  { lesson: 10, title: "高飛球與滾地球", focus: "抬頭追高飛球、蹲低擋滾地球，安全接球。", skills: ["空間判斷", "反應力"] },
  { lesson: 11, title: "綜合守備", focus: "小組完成接球、傳壘與補位，建立合作流程。", skills: ["團隊合作", "位置概念"] },
  { lesson: 12, title: "打擊與短打", focus: "握棒、站姿與看球擊球，體驗球座打擊。", skills: ["手眼協調", "擊球控制"] },
  { lesson: 13, title: "推打與拉打", focus: "把球打向不同方向，感受擊球時間點與棒面。", skills: ["方向控制", "擊球技巧"] },
  { lesson: 14, title: "守備與跑壘", focus: "擊球後依序跑壘，守備接球傳壘，理解攻守轉換。", skills: ["速度控制", "規則應用"] },
  { lesson: 15, title: "裁判與教練模擬", focus: "輪流當小裁判與小教練，練習口令與判定。", skills: ["表達力", "責任感"] },
  { lesson: 16, title: "基本技巧驗收", focus: "投球、守備、打擊、跑壘四站挑戰，看見進步。", skills: ["綜合能力", "自信心"] },
  { lesson: 17, title: "模擬比賽", focus: "簡化分組賽，熟悉打擊順序、跑壘與三人出局。", skills: ["比賽理解", "團隊合作"] },
  { lesson: 18, title: "全壘打挑戰", focus: "安全球座遠距離打擊，挑戰指定得分區。", skills: ["爆發力", "擊球表現"] },
  { lesson: 19, title: "投準大賽", focus: "挑戰不同距離目標區，調整投球力量與方向。", skills: ["準確度", "專注力"] },
  { lesson: 20, title: "分組對抗賽", focus: "友誼對抗賽綜合投、接、打、跑，練習賽後致意。", skills: ["成果展現", "運動精神"] },
];

export const CANONICAL_LESSON_DETAILS: Record<string, CanonicalLessonDetail[]> = {
  體能: FITNESS_LESSON_DETAILS,
  足球: FOOTBALL_LESSON_DETAILS,
  帶式橄欖球: FLAG_RUGBY_LESSON_DETAILS,
  棒球: TEEBALL_LESSON_DETAILS,
};
