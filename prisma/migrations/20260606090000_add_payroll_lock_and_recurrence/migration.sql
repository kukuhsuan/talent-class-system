-- Payroll history protection
ALTER TABLE "Attendance" ADD COLUMN "isPayrollLocked" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Attendance" ADD COLUMN "payrollLockedAt" DATETIME;

-- Persist the scheduling rule instead of inferring it from Attendance rows
ALTER TABLE "Course" ADD COLUMN "recurrenceType" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Course" ADD COLUMN "startDate" DATETIME;
ALTER TABLE "Course" ADD COLUMN "endDate" DATETIME;
ALTER TABLE "Course" ADD COLUMN "weekday" TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS "Attendance_isPayrollLocked_idx" ON "Attendance"("isPayrollLocked");

-- Keep cancellations, makeups and one-off dates separate from the recurrence rule
CREATE TABLE "CourseScheduleException" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "courseId" INTEGER NOT NULL,
    "date" DATETIME NOT NULL,
    "type" TEXT NOT NULL,
    "replacementDate" DATETIME,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CourseScheduleException_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "CourseScheduleException_courseId_date_idx" ON "CourseScheduleException"("courseId", "date");
CREATE INDEX "CourseScheduleException_type_idx" ON "CourseScheduleException"("type");
