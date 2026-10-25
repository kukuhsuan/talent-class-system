const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const assert = require("node:assert/strict");
const ts = require("typescript");
const root = path.resolve(__dirname, "..");
function load(file, modules = {}, extra = "") {
  const output = ts.transpileModule(fs.readFileSync(path.join(root, file), "utf8") + extra, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(output, {
    module, exports: module.exports, process, Response, console, URLSearchParams,
    require: name => {
      if (name in modules) return modules[name];
      throw new Error(`Unexpected dependency access: ${name}`);
    },
  });
  return module.exports;
}
async function main() {
  const maintenance = load("src/lib/reportMaintenance.ts");
  delete process.env.TEACHER_REPORT_MAINTENANCE;
  assert.equal(maintenance.reportMaintenanceResponse(), null);
  process.env.TEACHER_REPORT_MAINTENANCE = "1";
  for (const [file, methods] of [
    ["src/app/api/report/[id]/route.ts", ["GET", "POST", "PATCH"]],
    ["src/app/api/report/[id]/photo/route.ts", ["POST", "DELETE"]],
    ["src/app/api/report/[id]/start-confirmation/route.ts", ["POST"]],
  ]) {
    const code = fs.readFileSync(path.join(root, file), "utf8");
    const deps = Object.fromEntries([...code.matchAll(/from ["']([^"']+)["']/g)].map(m => [m[1], {}]));
    deps["@/lib/reportMaintenance"] = maintenance;
    const handlers = load(file, deps);
    for (const method of methods) {
      const response = await handlers[method]({}, { params: Promise.resolve({ id: "test" }) });
      assert.equal(response.status, 503, `${file} ${method}`);
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.equal((await response.json()).code, "REPORT_MAINTENANCE");
    }
  }
  // Exercise LINE entry points with all data/service dependencies absent.
  const lineFile = "src/lib/lineWebhook.ts";
  const lineDeps = Object.fromEntries([...fs.readFileSync(path.join(root, lineFile), "utf8").matchAll(/from ["']([^"']+)["']/g)].map(m => [m[1], {}]));
  const replies = [];
  lineDeps["@/lib/reportMaintenance"] = maintenance;
  lineDeps["@/lib/line"] = { replyMessage: async (...args) => replies.push(args) };
  lineDeps["@/lib/lineConversationState"] = { getLineConversationStateRecord: async () => null };
  const line = load(lineFile, lineDeps, "\nexport { handlePostback, ensureTeacherCanSubmitReport, handleCountSubmit, saveDetailedReport };\n");
  for (const action of ["report", "report_count", "report_progress", "report_detail", "select_progress"]) {
    await line.handlePostback("teacher", `action=${action}&id=1`, "reply", "north", "token");
  }
  assert.equal(await line.ensureTeacherCanSubmitReport("teacher", 1, "reply", "token"), false);
  await line.handleCountSubmit("teacher", 1, "A", 12, "reply", "token");
  await line.saveDetailedReport("teacher", 1, "自訂：test", "reply", "token", "north");
  assert.equal(replies.length, 8);
  assert(replies.every(r => r[1][0].text === maintenance.REPORT_MAINTENANCE_MESSAGE));
  for (const action of ["notify_ack", "school_change_ack", "meeting_reply", "leave_select", "equipment_confirm"]) {
    assert.equal(maintenance.isTeacherReportAction(action), false);
  }
  const cards = load("src/lib/line.ts", {
    crypto: require("node:crypto"),
    "@/lib/reportMaintenance": maintenance,
    "@/lib/courseMeta": { COURSE_LABEL: {}, courseLabel: x => x, requiresStudentCount: () => true },
    "@/lib/equipmentReminderCore": { equipmentFirstClassText: () => "器材確認" },
    "@/lib/publicAccessToken": { signReportAccessToken: () => "test-token" },
    "@/lib/courseCurriculumDetails": { PICKLEBALL_LESSON_DETAILS: [], TEEBALL_LESSON_DETAILS: [] },
  });
  function checkBoxes(value) {
    if (!value || typeof value !== "object") return;
    if (value.type === "box") assert(value.contents.length > 0, "LINE box must not be empty");
    Object.values(value).forEach(v => Array.isArray(v) ? v.forEach(checkBoxes) : checkBoxes(v));
  }
  const basic = { attendanceId: 1, school: "測試園所", courseType: "足球", time: "15:00–16:00" };
  for (const course of [basic, { ...basic, reportRole: "assistant" }, { ...basic, address: "測試地址" }, { ...basic, equipment: { isFirstClass: true, needsAssembly: true } }]) {
    const card = cards.buildReminderMessage({ teacherName: "測試老師", courses: [course] });
    const serialized = JSON.stringify(card);
    assert(serialized.includes("測試園所") && serialized.includes("15:00"));
    assert(!serialized.includes("/report/") && !serialized.includes("課後回報") && !serialized.includes("填寫出席人數"));
    assert(!serialized.includes("完成課程回報"));
    if (course.address) assert(serialized.includes("導航到上課地點"));
    if (course.equipment) assert(serialized.includes("equipment_assembled"));
    checkBoxes(card);
  }
  assert(!JSON.stringify(cards.buildReportRequestMessage({ ...basic })).includes("/report/"));
  const followupFile = "src/app/api/cron/operations-followup/route.ts";
  const followupDeps = Object.fromEntries([...fs.readFileSync(path.join(root, followupFile), "utf8").matchAll(/from ["']([^"']+)["']/g)].map(m => [m[1], {}]));
  followupDeps["next/server"] = { NextResponse: Response };
  followupDeps["@/lib/reportMaintenance"] = maintenance;
  followupDeps["@/lib/courseDates"] = { taipeiDateIso: () => "2026-10-20" };
  const followup = load(followupFile, followupDeps);
  process.env.CRON_SECRET = "test-only";
  assert.equal((await followup.GET({ headers: new Headers() })).status, 401);
  const skipped = await followup.GET({ headers: new Headers({ authorization: "Bearer test-only" }) });
  assert.equal((await skipped.json()).teacherReminderSent, 0);
  process.env.TEACHER_REPORT_MAINTENANCE = "0";
  assert.equal(maintenance.reportMaintenanceResponse(), null);
  assert(JSON.stringify(cards.buildReminderMessage({ teacherName: "測試老師", courses: [basic] })).includes("/report/"));
  assert(JSON.stringify(cards.buildReportRequestMessage(basic)).includes("/report/"));
  console.log("PASS: HTTP/LINE guards; notification information retained; report buttons hidden; navigation/equipment retained; no empty LINE boxes; follow-up skipped; restore switch");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
