ALTER TABLE "Attendance" ADD COLUMN "schoolVerifierName" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Attendance" ADD COLUMN "schoolSignatureData" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Attendance" ADD COLUMN "schoolSignedAt" DATETIME;
