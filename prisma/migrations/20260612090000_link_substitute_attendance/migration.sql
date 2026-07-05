ALTER TABLE "Substitute" ADD COLUMN "attendanceId" INTEGER REFERENCES "Attendance"("id") ON DELETE SET NULL;
ALTER TABLE "Substitute" ADD COLUMN "role" TEXT NOT NULL DEFAULT '主教';

CREATE UNIQUE INDEX IF NOT EXISTS "Substitute_attendanceId_role_key"
ON "Substitute"("attendanceId", "role");

CREATE INDEX IF NOT EXISTS "Substitute_attendanceId_idx"
ON "Substitute"("attendanceId");
