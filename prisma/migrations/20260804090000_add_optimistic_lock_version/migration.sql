-- 樂觀鎖版本號。既有資料一律從 0 起算，所以要有 DEFAULT，
-- 否則 SQLite 對已有資料列的 NOT NULL 欄位會直接拒絕 ALTER。
ALTER TABLE "Course" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Attendance" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "SalaryAdjustment" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;
