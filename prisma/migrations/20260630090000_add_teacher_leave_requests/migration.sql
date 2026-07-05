CREATE TABLE IF NOT EXISTS "TeacherLeaveRequest" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "teacherId" INTEGER NOT NULL,
  "attendanceId" INTEGER NOT NULL,
  "courseId" INTEGER NOT NULL,
  "role" TEXT NOT NULL DEFAULT '主教',
  "leaveDate" DATETIME NOT NULL,
  "startTime" TEXT NOT NULL DEFAULT '',
  "endTime" TEXT NOT NULL DEFAULT '',
  "reason" TEXT NOT NULL,
  "notes" TEXT NOT NULL DEFAULT '',
  "status" TEXT NOT NULL DEFAULT '待審核',
  "semesterLeaveCountAtSubmit" INTEGER NOT NULL DEFAULT 0,
  "reviewedBy" TEXT NOT NULL DEFAULT '',
  "reviewedAt" DATETIME,
  "rejectedReason" TEXT NOT NULL DEFAULT '',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TeacherLeaveRequest_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "TeacherLeaveRequest_attendanceId_fkey" FOREIGN KEY ("attendanceId") REFERENCES "Attendance" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "TeacherLeaveRequest_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "TeacherLeaveRequest_teacherId_leaveDate_idx" ON "TeacherLeaveRequest"("teacherId", "leaveDate");
CREATE INDEX IF NOT EXISTS "TeacherLeaveRequest_attendanceId_idx" ON "TeacherLeaveRequest"("attendanceId");
CREATE INDEX IF NOT EXISTS "TeacherLeaveRequest_courseId_idx" ON "TeacherLeaveRequest"("courseId");
CREATE INDEX IF NOT EXISTS "TeacherLeaveRequest_status_idx" ON "TeacherLeaveRequest"("status");

CREATE TABLE IF NOT EXISTS "SubstituteInquiry" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "leaveRequestId" INTEGER NOT NULL,
  "attendanceId" INTEGER NOT NULL,
  "candidateTeacherId" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "sentAt" DATETIME,
  "respondedAt" DATETIME,
  "lineMessageId" TEXT NOT NULL DEFAULT '',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SubstituteInquiry_leaveRequestId_fkey" FOREIGN KEY ("leaveRequestId") REFERENCES "TeacherLeaveRequest" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SubstituteInquiry_attendanceId_fkey" FOREIGN KEY ("attendanceId") REFERENCES "Attendance" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "SubstituteInquiry_candidateTeacherId_fkey" FOREIGN KEY ("candidateTeacherId") REFERENCES "Teacher" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "SubstituteInquiry_leaveRequestId_candidateTeacherId_key" ON "SubstituteInquiry"("leaveRequestId", "candidateTeacherId");
CREATE INDEX IF NOT EXISTS "SubstituteInquiry_attendanceId_idx" ON "SubstituteInquiry"("attendanceId");
CREATE INDEX IF NOT EXISTS "SubstituteInquiry_candidateTeacherId_idx" ON "SubstituteInquiry"("candidateTeacherId");
CREATE INDEX IF NOT EXISTS "SubstituteInquiry_status_idx" ON "SubstituteInquiry"("status");
