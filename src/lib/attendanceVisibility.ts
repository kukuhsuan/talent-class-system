import type { Prisma } from "@prisma/client";

/**
 * Operational attendance lists must not resurrect empty placeholder rows after a
 * course is archived.  Real history is kept for payroll, billing and audit.
 */
export function visibleOperationalAttendanceWhere(): Prisma.AttendanceWhereInput {
  return {
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
  };
}
