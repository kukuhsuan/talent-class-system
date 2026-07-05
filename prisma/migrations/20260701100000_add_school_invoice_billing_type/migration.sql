ALTER TABLE "SchoolInvoiceItem" ADD COLUMN "billingType" TEXT NOT NULL DEFAULT 'perClass';
ALTER TABLE "SchoolInvoiceItem" ADD COLUMN "quantityLabel" TEXT NOT NULL DEFAULT '堂';
ALTER TABLE "SchoolInvoiceDetail" ADD COLUMN "hours" REAL NOT NULL DEFAULT 0;
