import { courseLabel } from "@/lib/courseMeta";

export const SKILL_FOCUS_OPTIONS = ["專注力", "團隊合作", "肢體協調", "規則理解", "情緒控制", "手眼協調"] as const;
export const CLASS_STATUS_OPTIONS = ["很順利", "普通", "需要注意"] as const;

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
};

function joinList(items: string[]) {
  if (items.length === 0) return "課堂參與與基礎能力";
  if (items.length === 1) return items[0];
  return items.join("、");
}

export function generateTeachingReport(input: TeachingReportInput) {
  const course = courseLabel(input.courseType);
  const progress = input.progress.trim() || `${course}課程練習`;
  const skills = joinList(input.skillFocus);
  const statusText = input.classStatus || "普通";
  const statusSentence = statusText === "很順利"
    ? "整體課堂進行順利，孩子能依照老師指令完成練習。"
    : statusText === "需要注意"
      ? "課堂中有部分狀況需要持續留意，後續可加強引導與穩定度。"
      : "整體課堂進行平穩，孩子大多能跟上活動節奏。";

  const incidentSentence = input.incident
    ? `本次課程有特殊事件，孩子${input.incidentChild ? `「${input.incidentChild}」` : ""}狀況為：${input.incidentProcess || "已由老師現場觀察與處理"}。處理方式：${input.incidentAction || "已即時安撫並協助回到課程" }。${input.incidentNotified === "是" ? "已通知園所。" : "尚未通知園所。"}`
    : "本次課程無特殊事件。";

  return {
    aiSummary: `今日課程主要進行${progress}，${statusSentence}`,
    aiSkillFocus: `本次課程培養孩子的${skills}能力，透過遊戲化活動與分組練習提升孩子參與度。`,
    aiTeachingNote: `本堂課孩子整體參與狀況${statusText === "需要注意" ? "仍需關注" : "良好"}，能在老師引導下完成指定任務。${incidentSentence}`,
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
