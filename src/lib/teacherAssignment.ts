export const WAITING_TEACHER_NAME = "待排老師";

export function isWaitingTeacherName(name: string | null | undefined) {
  return name?.trim() === WAITING_TEACHER_NAME;
}
