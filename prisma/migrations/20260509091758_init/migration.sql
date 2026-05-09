-- CreateTable
CREATE TABLE "Teacher" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "rateAfterSchool" INTEGER NOT NULL DEFAULT 500,
    "rateInSchool" INTEGER NOT NULL DEFAULT 500,
    "rateDemo" INTEGER NOT NULL DEFAULT 200,
    "travelFee" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Course" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "code" TEXT NOT NULL,
    "region" TEXT NOT NULL DEFAULT '',
    "teacherId" INTEGER NOT NULL,
    "school" TEXT NOT NULL,
    "courseType" TEXT NOT NULL,
    "dayOfWeek" TEXT NOT NULL DEFAULT '',
    "time" TEXT NOT NULL DEFAULT '',
    "category" TEXT NOT NULL DEFAULT '課後',
    "enrollCount" TEXT NOT NULL DEFAULT '',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Course_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Attendance" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "date" DATETIME NOT NULL,
    "courseId" INTEGER NOT NULL,
    "actualTeacherId" INTEGER NOT NULL,
    "studentCount" INTEGER,
    "cancelled" BOOLEAN NOT NULL DEFAULT false,
    "category" TEXT NOT NULL DEFAULT '課後',
    "hours" REAL NOT NULL DEFAULT 1,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Attendance_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Attendance_actualTeacherId_fkey" FOREIGN KEY ("actualTeacherId") REFERENCES "Teacher" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Substitute" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "date" DATETIME NOT NULL,
    "school" TEXT NOT NULL,
    "courseType" TEXT NOT NULL DEFAULT '',
    "originalTeacherId" INTEGER NOT NULL,
    "substituteTeacherId" INTEGER,
    "confirmed" BOOLEAN NOT NULL DEFAULT false,
    "fee" INTEGER,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Substitute_originalTeacherId_fkey" FOREIGN KEY ("originalTeacherId") REFERENCES "Teacher" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Substitute_substituteTeacherId_fkey" FOREIGN KEY ("substituteTeacherId") REFERENCES "Teacher" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Teacher_name_key" ON "Teacher"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Course_code_key" ON "Course"("code");
