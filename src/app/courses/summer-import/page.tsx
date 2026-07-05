"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useState } from "react";

type DryRunResult = {
  ok: boolean;
  year: number;
  importMode: "skip" | "overwrite";
  summary: {
    totalRows: number;
    validRows: number;
    newSchools: number;
    updateSchools: number;
    newCourses: number;
    newAttendanceDates: number;
    duplicates: number;
    dateErrors: number;
    timeNeedsReview: number;
    missingFields: number;
    schoolConflicts: number;
    createdAttendances: number;
    overwrittenAttendances: number;
    skippedDuplicates: number;
    missingTeachers: number;
    blockedOverwrites: number;
    errors: number;
  };
  newSchools: Array<{ name: string; address: string; region: string }>;
  updateSchools: Array<{ id: number; name: string; address: string; updates: string[] }>;
  courseGroups: Array<{ key: string; schoolName: string; address: string; courseType: string; time: string; category?: string; teacherName?: string; assistantTeacherName?: string; payrollHours?: number | null; notes?: string; dates: string[]; rowNumbers: number[]; timeNeedsReview: boolean }>;
  actions: Array<{ rowNumber: number; action: "create" | "overwrite" | "skip" | "blocked"; reason: string; schoolName: string; courseType: string; date: string; time: string; category: string; teacherName: string; resolvedTeacherName: string; assistantTeacherName: string; resolvedAssistantTeacherName: string; payrollHours: number; safetyReasons: string[] }>;
  teacherWarnings: Array<{ rowNumber: number; field: string; name: string; fallback: string }>;
  blockedOverwrites: Array<{ rowNumber: number; reason: string; schoolName: string; courseType: string; date: string; time: string; safetyReasons: string[] }>;
  skippedDuplicates: Array<{ rowNumber: number; reason: string; schoolName: string; courseType: string; date: string; time: string }>;
  duplicates: Array<{ rowNumbers: number[]; reason: string; schoolName: string; address: string; courseType: string; time: string; dates: string[] }>;
  dateErrors: Array<{ rowNumber: number; value: string; errors: string[] }>;
  timeNeedsReview: Array<{ rowNumber: number; value: string; reason: string }>;
  missingFields: Array<{ rowNumber: number; fields: string[] }>;
  schoolConflicts: Array<{ rowNumber: number; name: string; address: string; existingAddress: string; reason: string }>;
  imported?: {
    schoolsCreated: number;
    schoolsUpdated: number;
    coursesCreated: number;
    coursesUpdated: number;
    attendancesCreated: number;
    attendancesUpdated: number;
    attendancesSkipped: number;
    blockedOverwrites: number;
    missingTeachers: number;
    errors: number;
  };
};

function SummaryCard({ label, value, tone = "slate" }: { label: string; value: number; tone?: "slate" | "green" | "amber" | "red" | "blue" }) {
  const color = {
    slate: "border-slate-200 bg-white text-slate-800",
    green: "border-green-100 bg-green-50 text-green-800",
    amber: "border-amber-100 bg-amber-50 text-amber-800",
    red: "border-red-100 bg-red-50 text-red-700",
    blue: "border-blue-100 bg-blue-50 text-blue-800",
  }[tone];
  return (
    <div className={`rounded-xl border px-4 py-3 ${color}`}>
      <div className="text-xs font-medium opacity-70">{label}</div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="font-semibold text-slate-800">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function actionLabel(action: "create" | "overwrite" | "skip" | "blocked") {
  if (action === "create") return <span className="rounded-full bg-green-50 px-2 py-1 text-xs font-medium text-green-700">新增</span>;
  if (action === "overwrite") return <span className="rounded-full bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700">覆蓋</span>;
  if (action === "skip") return <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">略過</span>;
  return <span className="rounded-full bg-red-50 px-2 py-1 text-xs font-medium text-red-700">不可覆蓋</span>;
}

export default function SummerCampImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [year, setYear] = useState(new Date().getFullYear());
  const [importMode, setImportMode] = useState<"skip" | "overwrite">("skip");
  const [result, setResult] = useState<DryRunResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");

  async function submit(mode: "dry-run" | "import") {
    if (!file) {
      setError("請先選擇 Excel 檔案");
      return;
    }
    setError("");
    if (mode === "dry-run") setLoading(true);
    else setImporting(true);
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("year", String(year));
      body.append("mode", mode);
      body.append("importMode", importMode);
      const res = await fetch("/api/imports/summer-camp", { method: "POST", body });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "匯入處理失敗");
      setResult(data);
    } catch (e) {
      setError((e as Error).message || "匯入處理失敗");
    } finally {
      setLoading(false);
      setImporting(false);
    }
  }

  const canImport = Boolean(result?.ok && !result.imported);

  return (
    <div className="mx-auto max-w-6xl p-4 md:p-6">
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">安親班暑期課程批次匯入</h1>
          <p className="mt-1 text-sm text-slate-500">先 Dry Run 預覽，確認後才會寫入園所、課程排班與實際上課日期。</p>
        </div>
        <Link href="/courses?dept=安親班&teacher=unassigned" className="text-sm font-medium text-blue-600 hover:underline">
          回課程排班
        </Link>
      </div>

      <div className="mb-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-4 md:grid-cols-[1fr_160px_auto_auto] md:items-end">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Excel 檔案（.xlsx）</label>
            <input type="file" accept=".xlsx" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setResult(null); }}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">日期年度</label>
            <input type="number" value={year} onChange={(e) => setYear(Number(e.target.value) || new Date().getFullYear())}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
          </div>
          <button type="button" onClick={() => submit("dry-run")} disabled={loading || importing}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
            {loading ? "分析中..." : "Dry Run 預覽"}
          </button>
          <button type="button" onClick={() => submit("import")} disabled={!canImport || loading || importing}
            className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-40">
            {importing ? "匯入中..." : "確認正式匯入"}
          </button>
        </div>
        <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50 p-3">
          <div className="mb-2 text-sm font-semibold text-slate-700">重複資料處理模式</div>
          <div className="flex flex-col gap-2 md:flex-row">
            <label className={`flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-sm ${importMode === "skip" ? "border-blue-200 bg-blue-50 text-blue-800" : "border-slate-200 bg-white text-slate-600"}`}>
              <input type="radio" checked={importMode === "skip"} onChange={() => { setImportMode("skip"); setResult(null); }} />
              <span><strong>略過重複資料</strong><br /><span className="text-xs opacity-75">同一堂課已存在時不覆蓋，最安全。</span></span>
            </label>
            <label className={`flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-sm ${importMode === "overwrite" ? "border-amber-200 bg-amber-50 text-amber-800" : "border-slate-200 bg-white text-slate-600"}`}>
              <input type="radio" checked={importMode === "overwrite"} onChange={() => { setImportMode("overwrite"); setResult(null); }} />
              <span><strong>覆蓋重複資料</strong><br /><span className="text-xs opacity-75">只更新未回報、未鎖薪、未通知、未取消、無代課紀錄的出勤。</span></span>
            </label>
          </div>
        </div>
        <div className="mt-3 text-xs leading-5 text-slate-500">
          必要欄位：園所名稱、地址、地區、課程項目、上課時間、日期。可選欄位：主教老師、助教老師、計薪時數、類別、備註。老師找不到時會先改為待排老師並列出警告。
        </div>
        {error && <div className="mt-3 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}
      </div>

      {result && (
        <div className="space-y-5">
          {result.imported && (
            <div className="rounded-xl border border-green-100 bg-green-50 p-4 text-sm text-green-800">
              匯入完成：新增園所 {result.imported.schoolsCreated} 間、更新園所 {result.imported.schoolsUpdated} 間、新增課程 {result.imported.coursesCreated} 堂、建立日期 {result.imported.attendancesCreated} 筆。
              {result.imported.coursesUpdated > 0 ? ` 更新課程 ${result.imported.coursesUpdated} 堂。` : ""}
              {result.imported.attendancesUpdated > 0 ? ` 覆蓋出勤 ${result.imported.attendancesUpdated} 筆。` : ""}
              {result.imported.attendancesSkipped > 0 ? ` 略過重複日期 ${result.imported.attendancesSkipped} 筆。` : ""}
              {result.imported.blockedOverwrites > 0 ? ` 無法覆蓋 ${result.imported.blockedOverwrites} 筆。` : ""}
            </div>
          )}

          {!result.ok && (
            <div className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm font-medium text-red-700">
              Dry Run 發現必要問題，請先修正 Excel 或確認同名不同地址的園所後再匯入。
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <SummaryCard label="總列數" value={result.summary.totalRows} />
            <SummaryCard label="新增園所" value={result.summary.newSchools} tone="blue" />
            <SummaryCard label="更新園所" value={result.summary.updateSchools} tone="blue" />
            <SummaryCard label="新增課程" value={result.summary.newCourses} tone="green" />
            <SummaryCard label="新增出勤" value={result.summary.createdAttendances ?? result.summary.newAttendanceDates} tone="green" />
            <SummaryCard label="覆蓋更新" value={result.summary.overwrittenAttendances ?? 0} tone={result.summary.overwrittenAttendances ? "amber" : "slate"} />
            <SummaryCard label="略過重複" value={result.summary.skippedDuplicates ?? 0} tone={result.summary.skippedDuplicates ? "amber" : "slate"} />
            <SummaryCard label="老師找不到" value={result.summary.missingTeachers ?? 0} tone={result.summary.missingTeachers ? "amber" : "slate"} />
            <SummaryCard label="無法覆蓋" value={result.summary.blockedOverwrites ?? 0} tone={result.summary.blockedOverwrites ? "red" : "slate"} />
            <SummaryCard label="可能重複" value={result.summary.duplicates} tone={result.summary.duplicates ? "amber" : "slate"} />
            <SummaryCard label="日期錯誤" value={result.summary.dateErrors} tone={result.summary.dateErrors ? "red" : "slate"} />
            <SummaryCard label="時間需確認" value={result.summary.timeNeedsReview} tone={result.summary.timeNeedsReview ? "amber" : "slate"} />
            <SummaryCard label="欄位缺漏" value={result.summary.missingFields} tone={result.summary.missingFields ? "red" : "slate"} />
            <SummaryCard label="園所衝突" value={result.summary.schoolConflicts} tone={result.summary.schoolConflicts ? "red" : "slate"} />
          </div>

          <Section title="預計新增課程">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[840px] text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-3 py-2 text-left">列號</th>
                    <th className="px-3 py-2 text-left">園所</th>
                    <th className="px-3 py-2 text-left">課程</th>
                    <th className="px-3 py-2 text-left">時間</th>
                    <th className="px-3 py-2 text-left">老師</th>
                    <th className="px-3 py-2 text-left">計薪</th>
                    <th className="px-3 py-2 text-left">日期</th>
                    <th className="px-3 py-2 text-left">狀態</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {result.courseGroups.map((group) => (
                    <tr key={group.key}>
                      <td className="px-3 py-2 text-slate-500">{group.rowNumbers.join("、")}</td>
                      <td className="px-3 py-2">
                        <div className="font-medium text-slate-900">{group.schoolName}</div>
                        <div className="text-xs text-slate-500">{group.address}</div>
                      </td>
                      <td className="px-3 py-2">{group.courseType}</td>
                      <td className="px-3 py-2">{group.time || "—"}</td>
                      <td className="px-3 py-2 text-xs leading-5">
                        主教：{group.teacherName || "待排老師"}<br />
                        助教：{group.assistantTeacherName || "無"}
                      </td>
                      <td className="px-3 py-2">{group.payrollHours ? `${group.payrollHours}h` : "自動估算"}</td>
                      <td className="px-3 py-2 text-xs leading-5">{group.dates.join("、")}</td>
                      <td className="px-3 py-2">
                        {group.timeNeedsReview
                          ? <span className="rounded-full bg-amber-50 px-2 py-1 text-xs text-amber-700">時間需人工確認</span>
                          : <span className="rounded-full bg-green-50 px-2 py-1 text-xs text-green-700">可匯入</span>}
                      </td>
                    </tr>
                  ))}
                  {result.courseGroups.length === 0 && <tr><td colSpan={8} className="py-6 text-center text-slate-400">沒有可匯入課程</td></tr>}
                </tbody>
              </table>
            </div>
          </Section>

          <Section title="匯入動作預覽">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-3 py-2 text-left">列號</th>
                    <th className="px-3 py-2 text-left">動作</th>
                    <th className="px-3 py-2 text-left">課堂</th>
                    <th className="px-3 py-2 text-left">老師</th>
                    <th className="px-3 py-2 text-left">計薪</th>
                    <th className="px-3 py-2 text-left">原因</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(result.actions ?? []).slice(0, 100).map((action, index) => (
                    <tr key={`${action.rowNumber}-${action.date}-${index}`}>
                      <td className="px-3 py-2 text-slate-500">{action.rowNumber}</td>
                      <td className="px-3 py-2">{actionLabel(action.action)}</td>
                      <td className="px-3 py-2">
                        <div className="font-medium text-slate-800">{action.date}｜{action.schoolName}｜{action.courseType}</div>
                        <div className="text-xs text-slate-500">{action.time}｜{action.category}</div>
                      </td>
                      <td className="px-3 py-2 text-xs leading-5">
                        主教：{action.resolvedTeacherName || "待排老師"}<br />
                        助教：{action.resolvedAssistantTeacherName || "無"}
                      </td>
                      <td className="px-3 py-2">{action.payrollHours ? `${action.payrollHours}h` : "—"}</td>
                      <td className="px-3 py-2 text-xs leading-5 text-slate-600">{action.safetyReasons?.length ? action.safetyReasons.join("、") : action.reason}</td>
                    </tr>
                  ))}
                  {(result.actions ?? []).length === 0 && <tr><td colSpan={6} className="py-6 text-center text-slate-400">沒有可執行動作</td></tr>}
                </tbody>
              </table>
              {(result.actions ?? []).length > 100 && <div className="mt-2 text-xs text-slate-400">僅顯示前 100 筆，另有 {(result.actions ?? []).length - 100} 筆。</div>}
            </div>
          </Section>

          <Section title="問題與提醒">
            <div className="grid gap-4 md:grid-cols-2">
              <IssueList title="老師找不到" items={(result.teacherWarnings ?? []).map((item) => `第 ${item.rowNumber} 列：${item.field}「${item.name}」找不到，改為 ${item.fallback}`)} />
              <IssueList title="無法覆蓋" items={(result.blockedOverwrites ?? []).map((item) => `第 ${item.rowNumber} 列：${item.date} ${item.schoolName} ${item.courseType}（${item.safetyReasons?.join("、") || item.reason}，未覆蓋）`)} />
              <IssueList title="已存在略過" items={(result.skippedDuplicates ?? []).map((item) => `第 ${item.rowNumber} 列：${item.date} ${item.schoolName} ${item.courseType}（${item.reason}）`)} />
              <IssueList title="日期格式解析失敗" items={result.dateErrors.map((item) => `第 ${item.rowNumber} 列：${item.value}（${item.errors.join("、")}）`)} />
              <IssueList title="時間需人工確認" items={result.timeNeedsReview.map((item) => `第 ${item.rowNumber} 列：${item.value || "空白"}（${item.reason}）`)} />
              <IssueList title="欄位缺漏" items={result.missingFields.map((item) => `第 ${item.rowNumber} 列：缺 ${item.fields.join("、")}`)} />
              <IssueList title="園所名稱衝突" items={result.schoolConflicts.map((item) => `第 ${item.rowNumber} 列：${item.name}，Excel 地址 ${item.address}，既有地址 ${item.existingAddress}`)} />
              <IssueList title="可能重複" items={result.duplicates.map((item) => `第 ${item.rowNumbers.join("、")} 列：${item.reason}｜${item.schoolName}｜${item.courseType}｜${item.dates.join("、")}`)} />
              <IssueList title="會新增園所" items={result.newSchools.map((item) => `${item.region ? `${item.region}｜` : ""}${item.name}｜${item.address}`)} />
            </div>
          </Section>
        </div>
      )}
    </div>
  );
}

function IssueList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
      <div className="text-sm font-semibold text-slate-700">{title} <span className="text-xs text-slate-400">{items.length}</span></div>
      {items.length === 0 ? (
        <div className="mt-2 text-xs text-slate-400">無</div>
      ) : (
        <ul className="mt-2 max-h-44 space-y-1 overflow-y-auto text-xs leading-5 text-slate-600">
          {items.slice(0, 30).map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}
          {items.length > 30 && <li className="text-slate-400">另有 {items.length - 30} 筆...</li>}
        </ul>
      )}
    </div>
  );
}
