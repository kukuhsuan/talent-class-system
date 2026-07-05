const COURSE_BEAR_IMAGE_MAP = [
  { keywords: ["街舞", "HipHop", "HIPHOP", "hiphop"], image: "/images/course-bears/hiphop-bear.png" },
  { keywords: ["足球"], image: "/images/course-bears/soccer-bear.png" },
  { keywords: ["籃球"], image: "/images/course-bears/basketball-bear.png" },
  { keywords: ["體能", "體適能"], image: "/images/course-bears/fitness-bear.png" },
  { keywords: ["體操"], image: "/images/course-bears/gymnastics-bear.png" },
  { keywords: ["舞蹈", "MV舞", "律動"], image: "/images/course-bears/dance-bear.png" },
  { keywords: ["棒球", "樂樂棒球"], image: "/images/course-bears/baseball-bear.png" },
  { keywords: ["高爾夫"], image: "/images/course-bears/golf-bear.png" },
  { keywords: ["冰壺", "地板冰壺", "小冰壺"], image: "/images/course-bears/curling-bear.png" },
  { keywords: ["正音", "注音", "學注音", "ㄅㄆㄇ"], image: "/images/course-bears/phonics-bear.png" },
] as const;

export function courseBearImage(courseName: string | null | undefined) {
  const name = String(courseName ?? "");
  return COURSE_BEAR_IMAGE_MAP.find((item) => item.keywords.some((keyword) => name.includes(keyword)))?.image ?? null;
}
