-- CreateIndex: Attendance.cancelled (used in nearly every WHERE clause)
CREATE INDEX IF NOT EXISTS "Attendance_cancelled_idx" ON "Attendance"("cancelled");

-- CreateIndex: Attendance.category (used in status=missing, salary, reportWindow filters)
CREATE INDEX IF NOT EXISTS "Attendance_category_idx" ON "Attendance"("category");

-- CreateIndex: Course.isActive (used in almost every course query)
CREATE INDEX IF NOT EXISTS "Course_isActive_idx" ON "Course"("isActive");

-- CreateIndex: Course.department (used in dept filter across all pages)
CREATE INDEX IF NOT EXISTS "Course_department_idx" ON "Course"("department");
