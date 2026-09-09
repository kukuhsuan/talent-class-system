import type { Prisma } from "@prisma/client";

// 課程日期縮短時，已有請假／異動等稽核關聯的預排堂次不能硬刪。
// 這類紀錄留在資料庫供稽核，但不應再出現在出勤、薪資、請款等營運清單。
export const REMOVED_FROM_COURSE_SCHEDULE_REASON = "已移出課程日期";

/**
 * Operational attendance lists must not resurrect empty placeholder rows after a
 * course is archived.  Real history is kept for payroll, billing and audit.
 */
export function visibleOperationalAttendanceWhere(): Prisma.AttendanceWhereInput {
  return {
    AND: [
      { NOT: { cancelReason: REMOVED_FROM_COURSE_SCHEDULE_REASON } },
      {
        OR: [
          { course: { is: { isActive: true } } },
          {
            AND: [
              { course: { is: { isActive: false } } },
              {
                OR: [
                  { cancelled: true },
                  { studentCount: { not: null } },
                  { studentCountA: { not: null } },
                  { studentCountB: { not: null } },
                  { reportContent: { not: "" } },
                  { reportSentAt: { not: null } },
                  { isPayrollLocked: true },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
}
