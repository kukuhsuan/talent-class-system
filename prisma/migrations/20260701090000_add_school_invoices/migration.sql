CREATE TABLE IF NOT EXISTS "SchoolInvoice" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "schoolId" INTEGER NOT NULL,
  "schoolName" TEXT NOT NULL,
  "brandName" TEXT NOT NULL,
  "invoiceMonth" TEXT NOT NULL,
  "invoiceDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "status" TEXT NOT NULL DEFAULT '已產生',
  "totalAmount" INTEGER NOT NULL DEFAULT 0,
  "taxType" TEXT NOT NULL DEFAULT '未稅',
  "notes" TEXT NOT NULL DEFAULT '',
  "companyName" TEXT NOT NULL DEFAULT '威斯博國際股份有限公司',
  "phone" TEXT NOT NULL DEFAULT '',
  "fax" TEXT NOT NULL DEFAULT '',
  "bankName" TEXT NOT NULL DEFAULT '',
  "bankAccount" TEXT NOT NULL DEFAULT '',
  "accountName" TEXT NOT NULL DEFAULT '威斯博國際股份有限公司',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SchoolInvoice_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "SchoolInvoiceItem" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "invoiceId" INTEGER NOT NULL,
  "courseType" TEXT NOT NULL,
  "courseName" TEXT NOT NULL,
  "periodLabel" TEXT NOT NULL,
  "unitPrice" INTEGER NOT NULL DEFAULT 0,
  "quantity" INTEGER NOT NULL DEFAULT 0,
  "subtotal" INTEGER NOT NULL DEFAULT 0,
  "note" TEXT NOT NULL DEFAULT '',
  CONSTRAINT "SchoolInvoiceItem_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "SchoolInvoice" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "SchoolInvoiceDetail" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "invoiceItemId" INTEGER NOT NULL,
  "attendanceId" INTEGER,
  "date" DATETIME NOT NULL,
  "weekday" TEXT NOT NULL,
  "time" TEXT NOT NULL DEFAULT '',
  "studentCount" INTEGER,
  "note" TEXT NOT NULL DEFAULT '',
  CONSTRAINT "SchoolInvoiceDetail_invoiceItemId_fkey" FOREIGN KEY ("invoiceItemId") REFERENCES "SchoolInvoiceItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "SchoolInvoice_schoolId_invoiceMonth_idx" ON "SchoolInvoice"("schoolId", "invoiceMonth");
CREATE INDEX IF NOT EXISTS "SchoolInvoice_invoiceMonth_idx" ON "SchoolInvoice"("invoiceMonth");
CREATE INDEX IF NOT EXISTS "SchoolInvoice_status_idx" ON "SchoolInvoice"("status");
CREATE INDEX IF NOT EXISTS "SchoolInvoiceItem_invoiceId_idx" ON "SchoolInvoiceItem"("invoiceId");
CREATE INDEX IF NOT EXISTS "SchoolInvoiceDetail_invoiceItemId_idx" ON "SchoolInvoiceDetail"("invoiceItemId");
CREATE INDEX IF NOT EXISTS "SchoolInvoiceDetail_attendanceId_idx" ON "SchoolInvoiceDetail"("attendanceId");
