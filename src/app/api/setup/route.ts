import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@libsql/client";

// Public idempotent migration endpoint — safe to call multiple times
// All ALTER TABLE use try/catch so they skip if column already exists
function authorized(req: NextRequest) {
  if (process.env.NODE_ENV !== "production") return true;
  const secret = process.env.ADMIN_PASSWORD;
  if (!secret) return false;
  const headerSecret = req.headers.get("x-admin-secret");
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return headerSecret === secret || bearer === secret;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const client = createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });

  const migrations = [
    'ALTER TABLE Teacher ADD COLUMN email TEXT NOT NULL DEFAULT ""',
    'ALTER TABLE Teacher ADD COLUMN phone TEXT NOT NULL DEFAULT ""',
    'ALTER TABLE Teacher ADD COLUMN isAssistant BOOLEAN NOT NULL DEFAULT false',
    'ALTER TABLE Teacher ADD COLUMN assistantFee INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE School ADD COLUMN type TEXT NOT NULL DEFAULT ""',
    'ALTER TABLE School ADD COLUMN portalTokenVersion INTEGER NOT NULL DEFAULT 1',
    'ALTER TABLE Course ADD COLUMN address TEXT NOT NULL DEFAULT ""',
    'ALTER TABLE Course ADD COLUMN assistantTeacherId INTEGER',
    'ALTER TABLE Attendance ADD COLUMN assistantTeacherId INTEGER',
    'ALTER TABLE Attendance ADD COLUMN studentCountA INTEGER',
    'ALTER TABLE Attendance ADD COLUMN studentCountB INTEGER',
    'ALTER TABLE Attendance ADD COLUMN cancelReason TEXT NOT NULL DEFAULT ""',
    'ALTER TABLE Attendance ADD COLUMN makeupDate DATETIME',
    'ALTER TABLE Attendance ADD COLUMN makeupDone BOOLEAN NOT NULL DEFAULT false',
    'ALTER TABLE Attendance ADD COLUMN skillFocus TEXT NOT NULL DEFAULT ""',
    'ALTER TABLE Attendance ADD COLUMN classStatus TEXT NOT NULL DEFAULT ""',
    'ALTER TABLE Attendance ADD COLUMN incident BOOLEAN NOT NULL DEFAULT false',
    'ALTER TABLE Attendance ADD COLUMN incidentChild TEXT NOT NULL DEFAULT ""',
    'ALTER TABLE Attendance ADD COLUMN incidentProcess TEXT NOT NULL DEFAULT ""',
    'ALTER TABLE Attendance ADD COLUMN incidentAction TEXT NOT NULL DEFAULT ""',
    'ALTER TABLE Attendance ADD COLUMN incidentNotified TEXT NOT NULL DEFAULT ""',
    'ALTER TABLE Attendance ADD COLUMN reportPhotos TEXT NOT NULL DEFAULT ""',
    'ALTER TABLE Attendance ADD COLUMN schoolNotifyStatus TEXT NOT NULL DEFAULT "未通知"',
    'ALTER TABLE Attendance ADD COLUMN schoolNotifyError TEXT NOT NULL DEFAULT ""',
    'ALTER TABLE Attendance ADD COLUMN schoolNotifiedAt DATETIME',
    'ALTER TABLE School ADD COLUMN lineRegion TEXT NOT NULL DEFAULT "school"',
    'ALTER TABLE Attendance ADD COLUMN aiSummary TEXT NOT NULL DEFAULT ""',
    'ALTER TABLE Attendance ADD COLUMN aiSkillFocus TEXT NOT NULL DEFAULT ""',
    'ALTER TABLE Attendance ADD COLUMN aiTeachingNote TEXT NOT NULL DEFAULT ""',
    'CREATE TABLE IF NOT EXISTS CourseProgress (id INTEGER PRIMARY KEY AUTOINCREMENT, courseType TEXT NOT NULL, lesson INTEGER NOT NULL, title TEXT NOT NULL, createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)',
    'CREATE UNIQUE INDEX IF NOT EXISTS CourseProgress_courseType_lesson_key ON CourseProgress(courseType, lesson)',
    'CREATE TABLE IF NOT EXISTS LessonTemplate (id INTEGER PRIMARY KEY AUTOINCREMENT, courseType TEXT NOT NULL, lesson INTEGER NOT NULL, title TEXT NOT NULL, focus TEXT NOT NULL DEFAULT "", skills TEXT NOT NULL DEFAULT "", activityDirection TEXT NOT NULL DEFAULT "", aiStyle TEXT NOT NULL DEFAULT "", createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)',
    'CREATE UNIQUE INDEX IF NOT EXISTS LessonTemplate_courseType_lesson_key ON LessonTemplate(courseType, lesson)',
    'CREATE TABLE IF NOT EXISTS CourseOption (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL UNIQUE, label TEXT NOT NULL, isActive BOOLEAN NOT NULL DEFAULT true, createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)',
    'CREATE TABLE IF NOT EXISTS SkillCard (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, icon TEXT NOT NULL DEFAULT "", imageUrl TEXT NOT NULL DEFAULT "", description TEXT NOT NULL DEFAULT "", isActive BOOLEAN NOT NULL DEFAULT true, createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)',
    'CREATE TABLE IF NOT EXISTS EquipmentStatus (id INTEGER PRIMARY KEY AUTOINCREMENT, schoolId INTEGER, school TEXT NOT NULL DEFAULT "", name TEXT NOT NULL, quantity TEXT NOT NULL DEFAULT "", status TEXT NOT NULL DEFAULT "正常", notes TEXT NOT NULL DEFAULT "", sortOrder INTEGER NOT NULL DEFAULT 0, isActive BOOLEAN NOT NULL DEFAULT true, createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)',
    'CREATE INDEX IF NOT EXISTS EquipmentStatus_schoolId_idx ON EquipmentStatus(schoolId)',
    'CREATE INDEX IF NOT EXISTS EquipmentStatus_school_idx ON EquipmentStatus(school)',
    'CREATE TABLE IF NOT EXISTS UserAccount (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL UNIQUE, name TEXT NOT NULL, passwordHash TEXT NOT NULL, role TEXT NOT NULL DEFAULT "admin", isActive BOOLEAN NOT NULL DEFAULT true, createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)',
    'ALTER TABLE UserAccount ADD COLUMN email TEXT NOT NULL DEFAULT ""',
    'ALTER TABLE UserAccount ADD COLUMN lastLoginAt DATETIME',
    'CREATE TABLE IF NOT EXISTS AuditLog (id INTEGER PRIMARY KEY AUTOINCREMENT, actorUserId INTEGER, actorName TEXT NOT NULL DEFAULT "", actorRole TEXT NOT NULL DEFAULT "", action TEXT NOT NULL, targetType TEXT NOT NULL, targetId TEXT NOT NULL DEFAULT "", targetLabel TEXT NOT NULL DEFAULT "", beforeData TEXT, afterData TEXT, diffSummary TEXT NOT NULL DEFAULT "", ipAddress TEXT NOT NULL DEFAULT "", userAgent TEXT NOT NULL DEFAULT "", sensitive BOOLEAN NOT NULL DEFAULT false, createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)',
    'CREATE INDEX IF NOT EXISTS AuditLog_actorUserId_createdAt_idx ON AuditLog(actorUserId, createdAt)',
    'CREATE INDEX IF NOT EXISTS AuditLog_action_createdAt_idx ON AuditLog(action, createdAt)',
    'CREATE INDEX IF NOT EXISTS AuditLog_targetType_targetId_idx ON AuditLog(targetType, targetId)',
    'CREATE INDEX IF NOT EXISTS AuditLog_sensitive_createdAt_idx ON AuditLog(sensitive, createdAt)',
    'CREATE TABLE IF NOT EXISTS KindergartenAssessment (id INTEGER PRIMARY KEY AUTOINCREMENT, attendanceId INTEGER NOT NULL, childName TEXT NOT NULL, semester TEXT NOT NULL DEFAULT "", courseName TEXT NOT NULL DEFAULT "", scores TEXT NOT NULL DEFAULT "", comment TEXT NOT NULL DEFAULT "", title TEXT NOT NULL DEFAULT "", certificatePayload TEXT NOT NULL DEFAULT "", createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)',
    'CREATE INDEX IF NOT EXISTS KindergartenAssessment_attendanceId_idx ON KindergartenAssessment(attendanceId)',
    'ALTER TABLE Substitute ADD COLUMN attendanceId INTEGER REFERENCES Attendance(id) ON DELETE SET NULL',
    'ALTER TABLE Substitute ADD COLUMN role TEXT NOT NULL DEFAULT "主教"',
    'CREATE UNIQUE INDEX IF NOT EXISTS Substitute_attendanceId_role_key ON Substitute(attendanceId, role)',
    'CREATE INDEX IF NOT EXISTS Substitute_attendanceId_idx ON Substitute(attendanceId)',
    'CREATE TABLE IF NOT EXISTS SalaryAdjustment (id INTEGER PRIMARY KEY AUTOINCREMENT, teacherId INTEGER NOT NULL REFERENCES Teacher(id) ON DELETE CASCADE, targetMonth TEXT NOT NULL, payoutMonth TEXT NOT NULL, type TEXT NOT NULL DEFAULT "補發", amount INTEGER NOT NULL, reason TEXT NOT NULL, notes TEXT NOT NULL DEFAULT "", isPaid BOOLEAN NOT NULL DEFAULT false, paidAt DATETIME, createdBy TEXT NOT NULL DEFAULT "", createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)',
    'CREATE INDEX IF NOT EXISTS SalaryAdjustment_teacherId_payoutMonth_idx ON SalaryAdjustment(teacherId, payoutMonth)',
    'CREATE INDEX IF NOT EXISTS SalaryAdjustment_payoutMonth_idx ON SalaryAdjustment(payoutMonth)',
    'CREATE INDEX IF NOT EXISTS SalaryAdjustment_targetMonth_idx ON SalaryAdjustment(targetMonth)',
    'CREATE INDEX IF NOT EXISTS SalaryAdjustment_isPaid_idx ON SalaryAdjustment(isPaid)',
    'CREATE TABLE IF NOT EXISTS SchoolInvoice (id INTEGER PRIMARY KEY AUTOINCREMENT, schoolId INTEGER NOT NULL, schoolName TEXT NOT NULL, brandName TEXT NOT NULL, invoiceMonth TEXT NOT NULL, invoiceDate DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, status TEXT NOT NULL DEFAULT "已產生", totalAmount INTEGER NOT NULL DEFAULT 0, taxType TEXT NOT NULL DEFAULT "未稅", notes TEXT NOT NULL DEFAULT "", companyName TEXT NOT NULL DEFAULT "威斯博國際股份有限公司", phone TEXT NOT NULL DEFAULT "", fax TEXT NOT NULL DEFAULT "", bankName TEXT NOT NULL DEFAULT "", bankAccount TEXT NOT NULL DEFAULT "", accountName TEXT NOT NULL DEFAULT "威斯博國際股份有限公司", createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)',
    'CREATE TABLE IF NOT EXISTS SchoolInvoiceItem (id INTEGER PRIMARY KEY AUTOINCREMENT, invoiceId INTEGER NOT NULL, courseType TEXT NOT NULL, courseName TEXT NOT NULL, periodLabel TEXT NOT NULL, billingType TEXT NOT NULL DEFAULT "perClass", unitPrice INTEGER NOT NULL DEFAULT 0, minChargeCount INTEGER NOT NULL DEFAULT 0, quantity INTEGER NOT NULL DEFAULT 0, quantityLabel TEXT NOT NULL DEFAULT "堂", actualStudentCount INTEGER NOT NULL DEFAULT 0, billableCount INTEGER NOT NULL DEFAULT 0, subtotal INTEGER NOT NULL DEFAULT 0, note TEXT NOT NULL DEFAULT "")',
    'CREATE TABLE IF NOT EXISTS SchoolInvoiceDetail (id INTEGER PRIMARY KEY AUTOINCREMENT, invoiceItemId INTEGER NOT NULL, attendanceId INTEGER, date DATETIME NOT NULL, weekday TEXT NOT NULL, time TEXT NOT NULL DEFAULT "", hours REAL NOT NULL DEFAULT 0, studentCount INTEGER, billableCount INTEGER, note TEXT NOT NULL DEFAULT "")',
    'ALTER TABLE SchoolInvoiceItem ADD COLUMN billingType TEXT NOT NULL DEFAULT "perClass"',
    'ALTER TABLE SchoolInvoiceItem ADD COLUMN quantityLabel TEXT NOT NULL DEFAULT "堂"',
    'ALTER TABLE SchoolInvoiceItem ADD COLUMN minChargeCount INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE SchoolInvoiceItem ADD COLUMN actualStudentCount INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE SchoolInvoiceItem ADD COLUMN billableCount INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE SchoolInvoiceDetail ADD COLUMN hours REAL NOT NULL DEFAULT 0',
    'ALTER TABLE SchoolInvoiceDetail ADD COLUMN billableCount INTEGER',
    'CREATE INDEX IF NOT EXISTS SchoolInvoice_schoolId_invoiceMonth_idx ON SchoolInvoice(schoolId, invoiceMonth)',
    'CREATE INDEX IF NOT EXISTS SchoolInvoice_invoiceMonth_idx ON SchoolInvoice(invoiceMonth)',
    'CREATE INDEX IF NOT EXISTS SchoolInvoice_status_idx ON SchoolInvoice(status)',
    'CREATE INDEX IF NOT EXISTS SchoolInvoiceItem_invoiceId_idx ON SchoolInvoiceItem(invoiceId)',
    'CREATE INDEX IF NOT EXISTS SchoolInvoiceDetail_invoiceItemId_idx ON SchoolInvoiceDetail(invoiceItemId)',
    'CREATE INDEX IF NOT EXISTS SchoolInvoiceDetail_attendanceId_idx ON SchoolInvoiceDetail(attendanceId)',
  ];

  const results: string[] = [];
  for (const sql of migrations) {
    try {
      await client.execute(sql);
      results.push(`✅ ${sql}`);
    } catch (e: unknown) {
      results.push(`⏭️ already exists: ${(e as Error).message.split("\n")[0]}`);
    }
  }

  return NextResponse.json({ ok: true, results });
}
