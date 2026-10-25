// node --test scripts/attendance-visibility.test.cjs
// Isolated in-memory database only; never loads application credentials.
/* eslint-disable @typescript-eslint/no-require-imports -- Standalone CommonJS Node test harness. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const { PrismaClient } = require('@prisma/client');
const { PrismaLibSql } = require('@prisma/adapter-libsql');

require.extensions['.ts'] = (module, filename) => module._compile(
  ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText,
  filename,
);
const { visibleOperationalAttendanceWhere, REMOVED_FROM_COURSE_SCHEDULE_REASON } =
  require('../src/lib/attendanceVisibility.ts');

test('archiving hides zero-count placeholders without deleting real history', async (t) => {
  const db = new PrismaClient({ adapter: new PrismaLibSql({ url: 'file::memory:' }) });
  t.after(() => db.$disconnect());
  await db.$executeRawUnsafe('CREATE TABLE Course (id INTEGER PRIMARY KEY, isActive BOOLEAN NOT NULL)');
  await db.$executeRawUnsafe(`CREATE TABLE Attendance (
    id INTEGER PRIMARY KEY, courseId INTEGER NOT NULL, date DATETIME NOT NULL,
    studentCount INTEGER, studentCountA INTEGER, studentCountB INTEGER,
    cancelled BOOLEAN NOT NULL DEFAULT 0, cancelReason TEXT NOT NULL DEFAULT '',
    reportContent TEXT NOT NULL DEFAULT '', reportSentAt DATETIME,
    isPayrollLocked BOOLEAN NOT NULL DEFAULT 0
  )`);
  await db.$executeRawUnsafe('INSERT INTO Course (id, isActive) VALUES (418, 0), (426, 1)');

  const cases = [
    ['C418 10/13 zero placeholder', false, { studentCount: 0 }],
    ['C418 empty placeholder', false, {}],
    ['C418 A/B zero placeholders', false, { studentCountA: 0, studentCountB: 0 }],
    ['C418 10/6 completed 13 students', true, { studentCount: 13, date: '2026-10-06' }],
    ['completed A class', true, { studentCountA: 5 }],
    ['completed B class', true, { studentCountB: 6 }],
    ['genuine zero-person report', true, { studentCount: 0, reportContent: '本堂無學生出席，已回報行政' }],
    ['in-school report without student count', true, { reportContent: '完成本堂體能課' }],
    ['sent report', true, { studentCount: 0, reportSentAt: '2026-10-06T09:00:00.000Z' }],
    ['payroll locked', true, { studentCount: 0, isPayrollLocked: 1 }],
    ['cancelled record', true, { cancelled: 1, studentCount: 0 }],
    ['C426 active zero placeholder unaffected', true, { courseId: 426, studentCount: 0 }],
    ['C426 active empty placeholder unaffected', true, { courseId: 426 }],
    ['removed schedule date remains hidden', false, { studentCount: 13, cancelReason: REMOVED_FROM_COURSE_SCHEDULE_REASON }],
    ['active removed schedule date remains hidden', false, { courseId: 426, cancelReason: REMOVED_FROM_COURSE_SCHEDULE_REASON }],
  ];
  for (const [index, [label, expected, overrides]] of cases.entries()) {
    const row = {
      id: index + 1, courseId: 418, date: '2026-10-13', studentCount: null,
      studentCountA: null, studentCountB: null, cancelled: 0, cancelReason: '',
      reportContent: '', reportSentAt: null, isPayrollLocked: 0, ...overrides,
    };
    const columns = Object.keys(row);
    await db.$executeRawUnsafe(
      `INSERT INTO Attendance (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`,
      ...Object.values(row),
    );
    await t.test(label, async () => {
      const rows = await db.attendance.findMany({
        where: { id: row.id, AND: [visibleOperationalAttendanceWhere()] },
        select: { id: true },
      });
      assert.equal(rows.length === 1, expected);
    });
  }
  assert.equal(await db.attendance.count(), cases.length, 'filter must never delete records');
});
