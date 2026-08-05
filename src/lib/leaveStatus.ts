// 請假單狀態單獨成一支。teacherLeaves.ts 會 import substituteAssignment，
// 而 substituteAssignment / pendingSubstitute 這些底層模組又需要判斷「這張假還開著嗎」，
// 常數留在 teacherLeaves 裡會變成循環 import（const 在模組初始化時求值，循環時會拿到 undefined）。
export const LEAVE_STATUS = {
  pending: "待審核",
  approved: "已核准，待找代課",
  searching: "尋找代課中",
  found: "已找到代課",
  rejected: "已駁回",
  cancelled: "已取消",
} as const;

// 還沒結案的假。只要假還開著，這堂課就不該算回原老師頭上——
// 不然薪資會發給沒去上課的人，園所也會被請到一堂沒人上的課。
export const OPEN_LEAVE_STATUSES: string[] = [
  LEAVE_STATUS.pending,
  LEAVE_STATUS.approved,
  LEAVE_STATUS.searching,
  LEAVE_STATUS.found,
];
