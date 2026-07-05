ALTER TABLE "SchoolInvoiceItem" ADD COLUMN "minChargeCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "SchoolInvoiceItem" ADD COLUMN "actualStudentCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "SchoolInvoiceItem" ADD COLUMN "billableCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "SchoolInvoiceDetail" ADD COLUMN "billableCount" INTEGER;
