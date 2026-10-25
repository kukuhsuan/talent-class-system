// No real credentials or services: run against the actual TS handlers with
// synthetic account/attendance records and explicitly mocked I/O.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
function load(file, deps, env = {}) {
  const source = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(source, {
    module, exports: module.exports, console: { ...console, error() {} }, Buffer, TextEncoder, Response, File,
    process: { env }, URL,
    require(name) { if (name in deps) return deps[name]; throw Error('Blocked dependency: ' + name); },
  });
  return module.exports;
}
class NextResponse extends Response {
  static json(body, options) { return new NextResponse(JSON.stringify(body), options); }
  static next() { return new NextResponse(null, { status: 200 }); }
  static redirect(url) { return new NextResponse(null, { status: 307, headers: { location: String(url) } }); }
}
const crypto = require('node:crypto');
const authSecret = { requiredAuthSecret: () => 'security-regression-only-secret-not-for-deployment' };
async function main() {
  const jose = await import('jose');
  let account = { isActive: true, role: 'staff', username: 'test', name: 'Test', passwordHash: 'synthetic-hash-a' };
  let dbDown = false;
  const sessions = load('src/lib/sessionAuth.ts', {
    'node:crypto': crypto, jose, '@/lib/authSecret': authSecret,
    '@/lib/prisma': { prisma: { userAccount: { findUnique: async () => { if (dbDown) throw Error('offline'); return account; } } } },
  }, { NODE_ENV: 'production' });
  const token = await sessions.signToken({ userId: 1, role: 'owner' }, account.passwordHash);
  assert.equal((await sessions.verifyToken(token)).role, 'staff', 'DB role must override JWT role');
  account.passwordHash = 'synthetic-hash-b';
  await assert.rejects(sessions.verifyToken(token), /revoked/);
  const fresh = await sessions.signToken({ userId: 1 }, account.passwordHash);
  assert.equal((await sessions.verifyToken(fresh)).username, 'test');
  account.isActive = false;
  await assert.rejects(sessions.verifyToken(fresh));
  account.isActive = true; dbDown = true;
  await assert.rejects(sessions.verifyToken(fresh));
  dbDown = false;
  const old = await new jose.SignJWT({ userId: 1, role: 'owner' }).setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('1h').sign(new TextEncoder().encode(authSecret.requiredAuthSecret()));
  await assert.rejects(sessions.verifyToken(old), 'old tokens lacking audience/version are rejected');
  const proxy = load('src/proxy.ts', { 'next/server': { NextResponse }, '@/lib/sessionAuth': sessions }, { NODE_ENV: 'production' });
  const request = cookie => ({ nextUrl: new URL('https://test.invalid/api/teachers'), url: 'https://test.invalid/api/teachers', method: 'GET', headers: new Headers(), cookies: { get: () => ({ value: cookie }) } });
  assert.equal((await proxy.proxy(request(fresh))).status, 200);
  assert.equal((await proxy.proxy(request(token))).status, 401);
  console.log('PASS session: password reset, disabled account, database failure, old token and proxy authorization');

  let row = { schoolId: 1, enabled: 1, codeHash: 'synthetic', sessionVersion: 1 };
  const portal = load('src/lib/portalAuth.ts', {
    crypto, bcryptjs: { hash: async () => 'new-code-hash' }, jose, 'next/server': { NextResponse }, '@/lib/authSecret': authSecret,
    '@/lib/prisma': { prisma: {
      $queryRawUnsafe: async () => row ? [row] : [],
      $executeRawUnsafe: async sql => {
        if (sql.includes('SET enabled = 0')) { row.enabled = 0; row.sessionVersion++; }
        if (sql.includes('ON CONFLICT')) { row.enabled = 1; row.codeHash = 'new-code-hash'; row.sessionVersion++; }
      },
    } },
  });
  const anonymous = { cookies: { get: () => undefined } };
  assert.equal((await portal.requirePortalVerification(anonymous, 1)).status, 401);
  const cookie = await portal.createPortalSessionCookie(1, true, 1);
  const verified = { cookies: { get: () => ({ value: cookie.value }) } };
  assert.equal(await portal.requirePortalVerification(verified, 1), null);
  assert.equal(await portal.hasValidPortalSession(verified, 2), false);
  await portal.disablePortalCode(1);
  assert.equal((await portal.requirePortalVerification(anonymous, 1)).status, 403);
  assert.equal((await portal.requirePortalVerification(verified, 1)).status, 403);
  await portal.generatePortalCode(1);
  assert.equal(await portal.hasValidPortalSession(verified, 1), false, 're-enable must not revive old cookies');
  await assert.rejects(portal.createPortalSessionCookie(1, true, 1), 'code rotation between verify and cookie issuance must fail');
  row = null;
  assert.equal((await portal.requirePortalVerification(anonymous, 1)).status, 403);
  console.log('PASS portal: enabled/disabled/unconfigured, cross-school cookie, code rotation and issuance race');

  const tokens = load('src/lib/publicAccessToken.ts', { 'node:crypto': crypto, '@/lib/authSecret': authSecret });
  const lead = tokens.signReportAccessToken(1, 'lead');
  const assistant = tokens.signReportAccessToken(1, 'assistant');
  const puts = [], deletes = [], events = [];
  let failPut = false, failDelete = false;
  let photos = [];
  const blob = {
    put: async (_p, _f, opts) => { puts.push(opts); if (failPut) throw Error('private access on public store'); return { pathname: 'report-photos/synthetic.jpg' }; },
    del: async (target, opts) => { deletes.push({ target, opts }); if (failDelete) throw Error('temporary storage failure'); events.push('delete'); },
  };
  const storage = load('src/lib/reportPhotoStorage.ts', { '@vercel/blob': blob }, {
    REPORT_PHOTO_READ_WRITE_TOKEN: 'test-private-token', BLOB_READ_WRITE_TOKEN: 'test-old-public-token',
  });
  const sharp = require('sharp');
  const photo = load('src/app/api/report/[id]/photo/route.ts', {
    '@/lib/reportMaintenance': { reportMaintenanceResponse: () => null },
    'next/server': { NextResponse }, 'node:crypto': crypto, sharp, '@vercel/blob': blob,
    '@/lib/reportPhotoStorage': storage,
    '@/lib/prisma': { prisma: { attendance: {
      findUnique: async () => ({ id: 1, reportPhotos: JSON.stringify(photos), course: { time: '10:00' } }),
      update: async ({ data }) => { events.push('update'); photos = JSON.parse(data.reportPhotos); },
    } } },
    '@/lib/publicAccessToken': tokens,
    '@/lib/attendanceTime': { attendanceScheduledTimeMap: async () => new Map(), effectiveAttendanceTime: () => '10:00' },
    '@/lib/reportWindow': { attendanceReportWindow: () => ({ expired: false, complete: false }) },
  });
  const context = id => ({ params: Promise.resolve({ id }) });
  const upload = file => ({ formData: async () => ({ get: () => file }) });
  assert.equal((await photo.POST({}, context(assistant))).status, 403);
  assert.equal((await photo.DELETE({}, context(assistant))).status, 403);
  assert.equal((await photo.POST({}, context('invalid-token'))).status, 401);
  const png = await sharp({ create: { width: 1, height: 1, channels: 3, background: '#ff0000' } }).png().toBuffer();
  const file = new File([png], 'test.png', { type: 'image/png' });
  failPut = true;
  assert.equal((await photo.POST(upload(file), context(lead))).status, 500);
  assert.equal(puts.length, 1, 'no public fallback');
  assert.equal(puts[0].access, 'private');
  assert.equal(photos.length, 0);
  failPut = false;
  assert.equal((await photo.POST(upload(new File(['<svg/>'], 'bad.jpg', { type: 'image/jpeg' })), context(lead))).status, 400);
  assert.equal((await photo.POST(upload(new File(['<svg/>'], 'bad.svg', { type: 'image/svg+xml' })), context(lead))).status, 400);
  assert.equal((await photo.POST(upload(file), context(lead))).status, 200);
  assert.equal(puts.at(-1).contentType, 'image/jpeg');
  const remove = () => ({ json: async () => ({ url: photos[0] }) });
  failDelete = true;
  assert.equal((await photo.DELETE(remove(), context(lead))).status, 500);
  assert.equal(photos.length, 1, 'retain retryable reference on storage error');
  failDelete = false; events.length = 0;
  assert.equal((await photo.DELETE(remove(), context(lead))).status, 200);
  assert.deepEqual(events, ['delete', 'update']);
  assert.equal(photos.length, 0);
  assert.equal(deletes.at(-1).opts.token, 'test-private-token');
  await storage.deleteReportPhoto('https://test.public.blob.vercel-storage.com/report-photos/legacy.jpg');
  assert.equal(deletes.at(-1).opts.token, 'test-old-public-token');
  await assert.rejects(storage.deleteReportPhoto('https://example.invalid/photo.jpg'));
  await assert.rejects(storage.deleteReportPhoto('https://test.public.blob.vercel-storage.com/teacher-documents/file.pdf'));
  console.log('PASS photos: assistant denied, private-only upload, raster validation, delete-before-unlink, retry and legacy-store ownership');

  const Excel = require('exceljs');
  const workbook = new Excel.Workbook();
  const sheet = workbook.addWorksheet('Security test');
  sheet.addRow(['synthetic', 42]);
  sheet.getCell('A1').note = 'uuid override compatibility';
  const copy = new Excel.Workbook();
  await copy.xlsx.load(await workbook.xlsx.writeBuffer());
  assert.equal(copy.worksheets[0].getCell('B1').value, 42);
  assert.ok(copy.worksheets[0].getCell('A1').note);
  console.log('PASS ExcelJS: workbook with comment round-trip using patched uuid');
}
main().catch(e => { console.error(e); process.exitCode = 1; });
