import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const Database = require("better-sqlite3");

const dbPath = process.env.MANUAL_DATABASE_PATH || "/private/tmp/manual-dev.db";
const db = new Database(dbPath);

function run(sql) {
  try {
    db.exec(sql);
  } catch (error) {
    if (!String(error.message).includes("duplicate column name") && !String(error.message).includes("already exists")) {
      throw error;
    }
  }
}

[
  'ALTER TABLE Teacher ADD COLUMN email TEXT NOT NULL DEFAULT ""',
  'ALTER TABLE Teacher ADD COLUMN lineUserId TEXT',
  'ALTER TABLE Teacher ADD COLUMN lineBindCode TEXT',
  'ALTER TABLE Teacher ADD COLUMN lineRegion TEXT NOT NULL DEFAULT ""',
  'ALTER TABLE School ADD COLUMN lineUserId TEXT',
  'ALTER TABLE School ADD COLUMN lineBindCode TEXT',
  'ALTER TABLE School ADD COLUMN lineRegion TEXT NOT NULL DEFAULT "school"',
  'ALTER TABLE School ADD COLUMN portalTokenVersion INTEGER NOT NULL DEFAULT 1',
  'ALTER TABLE Course ADD COLUMN assistantTeacherId INTEGER',
  'ALTER TABLE Course ADD COLUMN schoolId INTEGER',
  'ALTER TABLE Course ADD COLUMN address TEXT NOT NULL DEFAULT ""',
  'ALTER TABLE Course ADD COLUMN recurrenceType TEXT NOT NULL DEFAULT ""',
  'ALTER TABLE Course ADD COLUMN startDate DATETIME',
  'ALTER TABLE Course ADD COLUMN endDate DATETIME',
  'ALTER TABLE Course ADD COLUMN weekday TEXT NOT NULL DEFAULT ""',
  'ALTER TABLE Course ADD COLUMN department TEXT NOT NULL DEFAULT "幼兒園"',
  'ALTER TABLE Attendance ADD COLUMN assistantTeacherId INTEGER',
  'ALTER TABLE Attendance ADD COLUMN studentCountA INTEGER',
  'ALTER TABLE Attendance ADD COLUMN studentCountB INTEGER',
  'ALTER TABLE Attendance ADD COLUMN reportContent TEXT NOT NULL DEFAULT ""',
  'ALTER TABLE Attendance ADD COLUMN reportSentAt DATETIME',
  'ALTER TABLE Attendance ADD COLUMN schoolNotifyStatus TEXT NOT NULL DEFAULT "未通知"',
  'ALTER TABLE Attendance ADD COLUMN schoolNotifyError TEXT NOT NULL DEFAULT ""',
  'ALTER TABLE Attendance ADD COLUMN schoolNotifiedAt DATETIME',
  'ALTER TABLE Attendance ADD COLUMN skillFocus TEXT NOT NULL DEFAULT ""',
  'ALTER TABLE Attendance ADD COLUMN classStatus TEXT NOT NULL DEFAULT ""',
  'ALTER TABLE Attendance ADD COLUMN incident BOOLEAN NOT NULL DEFAULT false',
  'ALTER TABLE Attendance ADD COLUMN incidentChild TEXT NOT NULL DEFAULT ""',
  'ALTER TABLE Attendance ADD COLUMN incidentProcess TEXT NOT NULL DEFAULT ""',
  'ALTER TABLE Attendance ADD COLUMN incidentAction TEXT NOT NULL DEFAULT ""',
  'ALTER TABLE Attendance ADD COLUMN incidentNotified TEXT NOT NULL DEFAULT ""',
  'ALTER TABLE Attendance ADD COLUMN reportPhotos TEXT NOT NULL DEFAULT ""',
  'ALTER TABLE Attendance ADD COLUMN aiSummary TEXT NOT NULL DEFAULT ""',
  'ALTER TABLE Attendance ADD COLUMN aiSkillFocus TEXT NOT NULL DEFAULT ""',
  'ALTER TABLE Attendance ADD COLUMN aiTeachingNote TEXT NOT NULL DEFAULT ""',
  'ALTER TABLE Attendance ADD COLUMN isPayrollLocked BOOLEAN NOT NULL DEFAULT false',
  'ALTER TABLE Attendance ADD COLUMN payrollLockedAt DATETIME',
].forEach(run);

run(`CREATE TABLE IF NOT EXISTS UserAccount (
  id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  passwordHash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin',
  isActive BOOLEAN NOT NULL DEFAULT true,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
)`);

run(`CREATE TABLE IF NOT EXISTS CourseOption (
  id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  isActive BOOLEAN NOT NULL DEFAULT true,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
)`);

run(`CREATE TABLE IF NOT EXISTS CourseProgress (
  id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  courseType TEXT NOT NULL,
  lesson INTEGER NOT NULL,
  title TEXT NOT NULL,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(courseType, lesson)
)`);

run(`CREATE TABLE IF NOT EXISTS LessonTemplate (
  id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  courseType TEXT NOT NULL,
  lesson INTEGER NOT NULL,
  title TEXT NOT NULL,
  focus TEXT NOT NULL DEFAULT '',
  skills TEXT NOT NULL DEFAULT '',
  activityDirection TEXT NOT NULL DEFAULT '',
  aiStyle TEXT NOT NULL DEFAULT '',
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(courseType, lesson)
)`);

run(`CREATE TABLE IF NOT EXISTS KindergartenAssessment (
  id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  attendanceId INTEGER NOT NULL,
  childName TEXT NOT NULL,
  semester TEXT NOT NULL DEFAULT '',
  courseName TEXT NOT NULL DEFAULT '',
  scores TEXT NOT NULL DEFAULT '',
  comment TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  certificatePayload TEXT NOT NULL DEFAULT '',
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
)`);

run(`CREATE TABLE IF NOT EXISTS SkillCard (
  id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  icon TEXT NOT NULL DEFAULT '',
  imageUrl TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  isActive BOOLEAN NOT NULL DEFAULT true,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
)`);

run(`CREATE TABLE IF NOT EXISTS EquipmentStatus (
  id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  schoolId INTEGER,
  school TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL,
  quantity TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT '正常',
  notes TEXT NOT NULL DEFAULT '',
  sortOrder INTEGER NOT NULL DEFAULT 0,
  isActive BOOLEAN NOT NULL DEFAULT true,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
)`);

run(`CREATE TABLE IF NOT EXISTS CourseScheduleException (
  id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  courseId INTEGER NOT NULL,
  date DATETIME NOT NULL,
  type TEXT NOT NULL,
  replacementDate DATETIME,
  notes TEXT NOT NULL DEFAULT '',
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
)`);

[
  'CREATE INDEX IF NOT EXISTS Attendance_date_idx ON Attendance(date)',
  'CREATE INDEX IF NOT EXISTS Attendance_actualTeacherId_idx ON Attendance(actualTeacherId)',
  'CREATE INDEX IF NOT EXISTS Attendance_assistantTeacherId_idx ON Attendance(assistantTeacherId)',
  'CREATE INDEX IF NOT EXISTS Course_schoolId_idx ON Course(schoolId)',
  'CREATE INDEX IF NOT EXISTS Course_teacherId_idx ON Course(teacherId)',
  'CREATE INDEX IF NOT EXISTS KindergartenAssessment_attendanceId_idx ON KindergartenAssessment(attendanceId)',
].forEach(run);

db.close();
console.log(`Prepared ${dbPath}`);
