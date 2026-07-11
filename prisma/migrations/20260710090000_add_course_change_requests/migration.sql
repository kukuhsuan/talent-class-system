ALTER TABLE "Course" ADD COLUMN "location" TEXT NOT NULL DEFAULT '';

ALTER TABLE "Attendance" ADD COLUMN "scheduledSchoolId" INTEGER;
ALTER TABLE "Attendance" ADD COLUMN "scheduledSchoolName" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Attendance" ADD COLUMN "scheduledAddress" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Attendance" ADD COLUMN "scheduledLocation" TEXT NOT NULL DEFAULT '';

CREATE INDEX "Attendance_scheduledSchoolId_idx" ON "Attendance"("scheduledSchoolId");

CREATE TABLE "CourseChangeRequest" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "courseId" INTEGER NOT NULL,
  "teacherId" INTEGER NOT NULL,
  "primaryAttendanceId" INTEGER NOT NULL,
  "requestSource" TEXT NOT NULL DEFAULT 'ADMIN',
  "requestedByUserId" INTEGER,
  "requestedBySchoolId" INTEGER,
  "requestedByName" TEXT NOT NULL DEFAULT '',
  "changeScope" TEXT NOT NULL DEFAULT 'SINGLE',
  "changeTypes" TEXT NOT NULL DEFAULT '[]',
  "originalDate" DATETIME NOT NULL,
  "newDate" DATETIME,
  "originalStartTime" TEXT NOT NULL DEFAULT '',
  "originalEndTime" TEXT NOT NULL DEFAULT '',
  "newStartTime" TEXT NOT NULL DEFAULT '',
  "newEndTime" TEXT NOT NULL DEFAULT '',
  "originalSchoolId" INTEGER,
  "newSchoolId" INTEGER,
  "originalSchoolName" TEXT NOT NULL DEFAULT '',
  "newSchoolName" TEXT NOT NULL DEFAULT '',
  "originalAddress" TEXT NOT NULL DEFAULT '',
  "newAddress" TEXT NOT NULL DEFAULT '',
  "originalLocation" TEXT NOT NULL DEFAULT '',
  "newLocation" TEXT NOT NULL DEFAULT '',
  "reasonType" TEXT NOT NULL,
  "reasonNote" TEXT NOT NULL DEFAULT '',
  "status" TEXT NOT NULL DEFAULT '待行政審核',
  "reviewNote" TEXT NOT NULL DEFAULT '',
  "returnedAt" DATETIME,
  "lineSentAt" DATETIME,
  "teacherResponse" TEXT NOT NULL DEFAULT '',
  "teacherRespondedAt" DATETIME,
  "reviewedByUserId" INTEGER,
  "reviewedByName" TEXT NOT NULL DEFAULT '',
  "reviewedAt" DATETIME,
  "appliedByUserId" INTEGER,
  "appliedByName" TEXT NOT NULL DEFAULT '',
  "appliedAt" DATETIME,
  "cancelledAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CourseChangeRequest_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CourseChangeRequest_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "CourseChangeRequest_courseId_idx" ON "CourseChangeRequest"("courseId");
CREATE INDEX "CourseChangeRequest_teacherId_idx" ON "CourseChangeRequest"("teacherId");
CREATE INDEX "CourseChangeRequest_primaryAttendanceId_idx" ON "CourseChangeRequest"("primaryAttendanceId");
CREATE INDEX "CourseChangeRequest_requestedBySchoolId_idx" ON "CourseChangeRequest"("requestedBySchoolId");
CREATE INDEX "CourseChangeRequest_status_idx" ON "CourseChangeRequest"("status");
CREATE INDEX "CourseChangeRequest_requestSource_idx" ON "CourseChangeRequest"("requestSource");
CREATE INDEX "CourseChangeRequest_createdAt_idx" ON "CourseChangeRequest"("createdAt");

CREATE TABLE "CourseChangeRequestTarget" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "requestId" INTEGER NOT NULL,
  "attendanceId" INTEGER NOT NULL,
  "originalDate" DATETIME NOT NULL,
  "originalTime" TEXT NOT NULL DEFAULT '',
  "originalSchoolId" INTEGER,
  "originalSchoolName" TEXT NOT NULL DEFAULT '',
  "originalAddress" TEXT NOT NULL DEFAULT '',
  "originalLocation" TEXT NOT NULL DEFAULT '',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CourseChangeRequestTarget_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "CourseChangeRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CourseChangeRequestTarget_attendanceId_fkey" FOREIGN KEY ("attendanceId") REFERENCES "Attendance"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "CourseChangeRequestTarget_requestId_attendanceId_key" ON "CourseChangeRequestTarget"("requestId", "attendanceId");
CREATE INDEX "CourseChangeRequestTarget_attendanceId_idx" ON "CourseChangeRequestTarget"("attendanceId");

CREATE TABLE "CourseChangeRequestEvent" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "requestId" INTEGER NOT NULL,
  "actorType" TEXT NOT NULL DEFAULT '',
  "actorId" INTEGER,
  "actorName" TEXT NOT NULL DEFAULT '',
  "action" TEXT NOT NULL,
  "fromStatus" TEXT NOT NULL DEFAULT '',
  "toStatus" TEXT NOT NULL DEFAULT '',
  "note" TEXT NOT NULL DEFAULT '',
  "beforeData" TEXT NOT NULL DEFAULT '',
  "afterData" TEXT NOT NULL DEFAULT '',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CourseChangeRequestEvent_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "CourseChangeRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "CourseChangeRequestEvent_requestId_createdAt_idx" ON "CourseChangeRequestEvent"("requestId", "createdAt");

ALTER TABLE "CourseChangeRequest" ADD COLUMN "newStudentCount" INTEGER;
