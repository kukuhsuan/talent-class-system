import { courseLabel } from "@/lib/courseMeta";
import { getLessonProfile } from "@/lib/lessonContent";
import type { LessonTemplateForReport } from "@/lib/lessonTemplates";

export const SKILL_FOCUS_OPTIONS = ["專注力", "團隊合作", "肢體協調", "規則理解", "情緒控制", "手眼協調"] as const;
export const CLASS_STATUS_OPTIONS = ["積極參與", "穩定學習", "持續練習"] as const;
export const CLASS_STATUS_META: Record<string, { color: string; description: string }> = {
  積極參與: { color: "🟢", description: "孩子能投入課程活動，願意主動嘗試與互動。" },
  穩定學習: { color: "🔵", description: "孩子能跟著老師引導完成課程內容。" },
  持續練習: { color: "🟠", description: "孩子仍在熟悉課程內容，需要更多鼓勵與練習。" },
};

export function normalizeClassStatus(value: string) {
  if (value === "很順利") return "積極參與";
  if (value === "普通") return "穩定學習";
  if (value === "需要注意") return "持續練習";
  if (CLASS_STATUS_OPTIONS.includes(value as (typeof CLASS_STATUS_OPTIONS)[number])) return value;
  return "穩定學習";
}

export type TeachingReportInput = {
  school: string;
  courseType: string;
  progress: string;
  skillFocus: string[];
  classStatus: string;
  incident: boolean;
  incidentChild: string;
  incidentProcess: string;
  incidentAction: string;
  incidentNotified: string;
  lessonTemplate?: LessonTemplateForReport | null;
};

function joinList(items: string[]) {
  if (items.length === 0) return "課堂參與與基礎能力";
  if (items.length === 1) return items[0];
  return items.join("、");
}

function courseEmoji(course: string) {
  if (course.includes("足球")) return "⚽";
  if (course.includes("籃球")) return "🏀";
  if (course.includes("棒球")) return "⚾";
  if (course.includes("高爾夫")) return "⛳";
  if (course.includes("羽球")) return "🏸";
  if (course.includes("冰壺")) return "🥌";
  if (course.includes("舞蹈")) return "💃";
  return "🌟";
}

function learningValue(course: string, progress: string) {
  const profile = getLessonProfile(course, progress);
  if (profile.learningPoints.length > 0) return profile.learningPoints;

  const text = `${course} ${progress}`;
  if (text.includes("足球")) {
    return ["練習控制足球方向與力道", "學習移動中的身體平衡", "培養專注反應與腳步協調"];
  }
  if (text.includes("籃球")) {
    return ["練習運球與球感控制", "學習手眼協調與節奏感", "培養輪流等待與團隊合作"];
  }
  if (text.includes("棒球")) {
    return ["練習傳接球反應", "建立投球與接球基本動作", "培養專注力與觀察能力"];
  }
  if (text.includes("高爾夫")) {
    return ["練習控制擊球方向與力道", "學習專注與身體穩定", "培養耐心與動作控制"];
  }
  if (text.includes("羽球")) {
    return ["練習拍面控制與揮拍", "提升反應速度與手眼協調", "建立移動與平衡能力"];
  }
  if (text.includes("冰壺")) {
    return ["練習推壺方向與距離控制", "學習觀察目標與調整力道", "培養專注力與策略思考"];
  }
  if (text.includes("舞蹈")) {
    return ["練習身體節奏與肢體表達", "提升協調性與動作記憶", "培養自信與舞台表現"];
  }
  return ["練習基礎動作控制", "提升專注與身體協調", "培養參與感與自信心"];
}

function uniqueSentences(items: string[]) {
  const seen = new Set<string>();
  return items
    .map((item) => item.replace(/\s+/g, " ").trim())
    .filter((item) => {
      if (!item || seen.has(item)) return false;
      seen.add(item);
      return true;
    });
}

function splitManualItems(value: string) {
  return value
    .split(/[\n、,，]/u)
    .map((item) => item.replace(/^[\-*•\s]+/u, "").trim())
    .filter(Boolean);
}

function templateLearningValue(template: LessonTemplateForReport, emoji: string) {
  const manualFocus = splitManualItems(template.focus);
  const points = uniqueSentences(
    (manualFocus.length ? manualFocus : [`進行「${template.title}」活動`])
      .slice(0, 3),
  );

  return points.map((item) => `${emoji} ${item}`).join("\n");
}

function templateParagraph(template: LessonTemplateForReport) {
  const manualText = [template.activityDirection, template.aiStyle]
    .map((item) => item.trim())
    .filter(Boolean)
    .join("\n");
  if (manualText) return manualText;
  return `今天透過「${template.title || `第${template.lesson}堂課程`}」，孩子以遊戲方式完成練習。`;
}

function learningParagraph(course: string, progress: string, skills: string[]) {
  const profile = getLessonProfile(course, progress);
  const focusText = profile.skillFocus.length ? profile.skillFocus.join("、") : (skills.length ? skills.join("、") : "身體協調與參與自信");
  if (profile.parentSummary) {
    return `${profile.parentSummary}\n活動中也會特別引導孩子累積${focusText}。`;
  }

  const text = `${course} ${progress}`;
  const skillText = skills.length ? skills.join("、") : "反應能力、身體協調與團隊合作";
  if (text.includes("高爾夫")) {
    return `今天透過「${progress}」活動，孩子開始學習如何控制球的方向與速度，也練習在動作進行中保持身體平衡與專注力。\n課程中搭配遊戲挑戰與分組互動，讓孩子在輕鬆參與的過程中，自然建立${skillText}等能力。`;
  }
  if (text.includes("足球")) {
    return `今天透過「${progress}」活動，孩子練習控制球的方向與力道，也學習在移動中保持身體平衡。\n課程中搭配遊戲挑戰與分組互動，讓孩子自然累積${skillText}等能力。`;
  }
  if (text.includes("籃球")) {
    return `今天透過「${progress}」活動，孩子練習球感控制與移動節奏，也慢慢熟悉輪流等待與合作。\n課程中搭配遊戲挑戰與分組互動，讓孩子自然累積${skillText}等能力。`;
  }
  if (text.includes("棒球")) {
    return `今天透過「${progress}」活動，孩子練習傳接球反應與基本投球動作，也學習觀察目標與隊友。\n課程中搭配遊戲挑戰與分組互動，讓孩子自然累積${skillText}等能力。`;
  }
  if (text.includes("冰壺")) {
    return `今天透過「${progress}」活動，孩子練習推壺方向與距離控制，也學習觀察目標並調整力道。\n課程中搭配遊戲挑戰與分組互動，讓孩子自然累積${skillText}等能力。`;
  }
  return `今天透過「${progress}」活動，孩子把動作練習融入遊戲挑戰，也更能理解身體控制與反應的重要。\n課程中搭配分組互動，讓孩子自然累積${skillText}等能力。`;
}

export function generateTeachingReport(input: TeachingReportInput) {
  const course = courseLabel(input.courseType);
  const progress = input.progress.trim() || `${course}課程練習`;
  const skills = joinList(input.skillFocus);
  const emoji = courseEmoji(course);
  const template = input.lessonTemplate ?? null;
  const lessonProfile = template ? null : getLessonProfile(course, progress);
  const reportSkills = template?.skills?.length ? template.skills : (lessonProfile?.skillFocus ?? []);
  const values = template
    ? templateLearningValue(template, emoji)
    : learningValue(course, progress).map((item) => `${emoji} ${item}`).join("\n");
  const statusText = normalizeClassStatus(input.classStatus);
  const statusSentence = statusText === "積極參與"
    ? (lessonProfile?.classFeedback.active ?? "孩子能投入課程活動，願意主動嘗試與互動。")
    : statusText === "持續練習"
      ? (lessonProfile?.classFeedback.practice ?? "孩子仍在熟悉課程內容，需要更多鼓勵與練習。")
      : (lessonProfile?.classFeedback.steady ?? "孩子能跟著老師引導完成課程內容。");

  const incidentSentence = input.incident
    ? `${emoji} 今日有特殊事件，孩子${input.incidentChild ? `「${input.incidentChild}」` : ""}狀況為：${input.incidentProcess || "已由老師現場觀察與處理"}。處理方式：${input.incidentAction || "已即時安撫並協助回到課程" }。${input.incidentNotified === "是" ? "已通知園所。" : "尚未通知園所。"}`
    : "";

  return {
    aiSummary: `今天孩子學習：\n\n${values}\n\n${template ? templateParagraph(template) : learningParagraph(course, progress, input.skillFocus)}`,
    aiSkillFocus: `能力重點：${reportSkills.join("、") || skills}`,
    aiTeachingNote: [statusSentence, incidentSentence].filter(Boolean).join("\n\n"),
  };
}

export function safeJsonArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
  } catch {
    return value.split(/[、,，\n]/).map((item) => item.trim()).filter(Boolean);
  }
}
