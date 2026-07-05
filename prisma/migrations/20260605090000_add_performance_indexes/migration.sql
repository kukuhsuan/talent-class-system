-- CreateIndex
CREATE INDEX IF NOT EXISTS "Attendance_date_idx" ON "Attendance"("date");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Attendance_actualTeacherId_idx" ON "Attendance"("actualTeacherId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Attendance_assistantTeacherId_idx" ON "Attendance"("assistantTeacherId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Course_schoolId_idx" ON "Course"("schoolId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Course_teacherId_idx" ON "Course"("teacherId");
