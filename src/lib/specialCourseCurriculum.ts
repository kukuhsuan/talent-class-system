import { courseLabel } from "@/lib/courseMeta";

export type SpecialCourseLesson = {
  lesson: number;
  title: string;
  focus: string;
  skills: string[];
  activityDirection: string;
};

// 115 上學期何嘉仁新南幼兒園體能課（邱璽霖老師）專用課綱。
// 只套用在指定班級，不覆蓋其他園所共用的「體能」進度。
const XINNAN_PHYSICAL_115_1: SpecialCourseLesson[] = [
  { lesson: 1, title: "動物爬行", focus: "肢體協調、指令跟隨", skills: ["肢體協調", "指令跟隨"], activityDirection: "暖身、動作示範教學、放鬆收操" },
  { lesson: 2, title: "動物旅行", focus: "肢體協調、指令跟隨", skills: ["肢體協調", "指令跟隨"], activityDirection: "暖身、動作複習、三角爬行、收操" },
  { lesson: 3, title: "動物旅行", focus: "肢體協調、核心耐力", skills: ["肢體協調", "核心耐力"], activityDirection: "暖身、動作複習、爬階挑戰、收操" },
  { lesson: 4, title: "動物運動會", focus: "肢體協調、核心耐力", skills: ["肢體協調", "核心耐力"], activityDirection: "暖身、動作複習、動作銜接、收操" },
  { lesson: 5, title: "動物運動會", focus: "平衡協調、下肢耐力", skills: ["平衡協調", "下肢耐力"], activityDirection: "暖身、動作教學、平衡木、慢速爬階、收操" },
  { lesson: 6, title: "動物運動會", focus: "平衡協調、下肢耐力", skills: ["平衡協調", "下肢耐力"], activityDirection: "暖身、動作複習、平衡木、慢速爬階、收操" },
  { lesson: 7, title: "動物運動會", focus: "平衡協調、下肢耐力", skills: ["平衡協調", "下肢耐力"], activityDirection: "暖身、動作複習、平衡木、慢速爬階、收操" },
  { lesson: 8, title: "動物運動會", focus: "平衡協調、下肢耐力", skills: ["平衡協調", "下肢耐力"], activityDirection: "暖身、動作複習、平衡木、慢速爬階、收操" },
  { lesson: 9, title: "動物運動會", focus: "肢體協調、核心耐力", skills: ["肢體協調", "核心耐力"], activityDirection: "暖身、動作教學、爬行挑戰、搬移舉物、收操" },
  { lesson: 10, title: "動物運動會", focus: "肢體協調、核心耐力", skills: ["肢體協調", "核心耐力"], activityDirection: "暖身、動作複習、爬行挑戰、搬移舉物、收操" },
  { lesson: 11, title: "動物運動會", focus: "肢體協調、核心耐力", skills: ["肢體協調", "核心耐力"], activityDirection: "暖身、動作複習、爬行挑戰、搬移舉物、收操" },
  { lesson: 12, title: "動物運動會", focus: "肢體協調、核心耐力", skills: ["肢體協調", "核心耐力"], activityDirection: "暖身、動作複習、爬行挑戰、搬移舉物、收操" },
  { lesson: 13, title: "動物運動會", focus: "平衡協調、下肢耐力", skills: ["平衡協調", "下肢耐力"], activityDirection: "暖身、動作複習、平衡木、慢速爬階、收操" },
  { lesson: 14, title: "動物運動會", focus: "肢體協調、核心耐力", skills: ["肢體協調", "核心耐力"], activityDirection: "暖身、動作複習、爬行挑戰、搬移舉物、收操" },
  { lesson: 15, title: "能力評量", focus: "下肢肌肉能力評量", skills: ["下肢肌力", "動作控制"], activityDirection: "暖身、動作複習、下肢肌肉能力評量、收操" },
  { lesson: 16, title: "能力評量", focus: "核心肌肉能力評量", skills: ["核心肌力", "動作控制"], activityDirection: "暖身、動作複習、核心肌肉能力評量、收操" },
];

export function specialCourseCurriculum(input: { school?: string; courseType?: string; teacherName?: string }) {
  const school = String(input.school ?? "").replace(/\s+/g, "");
  const teacher = String(input.teacherName ?? "").replace(/\s+/g, "");
  if (school.includes("新南") && courseLabel(input.courseType ?? "") === "體能" && teacher === "邱璽霖") {
    return XINNAN_PHYSICAL_115_1;
  }
  return null;
}

export function lessonNumberFromProgress(progress: string) {
  const matched = String(progress ?? "").match(/第\s*(\d+)\s*堂/);
  return matched ? Number(matched[1]) : 0;
}
