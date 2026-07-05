CREATE TABLE "SalaryAdjustment" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "teacherId" INTEGER NOT NULL,
  "targetMonth" TEXT NOT NULL,
  "payoutMonth" TEXT NOT NULL,
  "type" TEXT NOT NULL DEFAULT '補發',
  "amount" INTEGER NOT NULL,
  "reason" TEXT NOT NULL,
  "notes" TEXT NOT NULL DEFAULT '',
  "isPaid" BOOLEAN NOT NULL DEFAULT false,
  "paidAt" DATETIME,
  "createdBy" TEXT NOT NULL DEFAULT '',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SalaryAdjustment_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "SalaryAdjustment_teacherId_payoutMonth_idx" ON "SalaryAdjustment"("teacherId", "payoutMonth");
CREATE INDEX "SalaryAdjustment_payoutMonth_idx" ON "SalaryAdjustment"("payoutMonth");
CREATE INDEX "SalaryAdjustment_targetMonth_idx" ON "SalaryAdjustment"("targetMonth");
CREATE INDEX "SalaryAdjustment_isPaid_idx" ON "SalaryAdjustment"("isPaid");
