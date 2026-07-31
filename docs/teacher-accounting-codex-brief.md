# 教師資料與會計管理 — 施工指令（給 Codex）

> 本文件是定稿版施工指令。背景盤點與決策理由見 `docs/teacher-accounting-plan.md`，有疑義時以本文件為準。

## 前提與紅線

1. **不要新建重複的表或頁面。** `Teacher`、`TeacherResume`、`PayrollRun`、`SalaryAdjustment`、`/teachers`、`/salary`、`/accounting`、`/api/export/salary`、`src/lib/permissions.ts` 都已存在，一律整合，不重寫。
2. **不要用 `prisma migrate`。** 正式環境是 Turso。新表用 `CREATE TABLE IF NOT EXISTS` 寫在 `ensureXxxTable()` 裡（照 `src/lib/payrollRun.ts`、`src/lib/teacherResume.ts` 的寫法）；新欄位用 `ALTER TABLE ... ADD COLUMN`（照 `src/lib/attendanceTime.ts` 的 `ensureAttendanceScheduledTimeColumn()`）。`prisma/schema.prisma` 同步補上定義即可。
3. **不要改薪資計算核心。** `src/lib/salaryCalculation.ts` 的四種費率邏輯維持原樣。
4. **履歷不做檔案上下載。** 維持既有線上表單 `/teacher-resume/{token}` 與名片頁 `/teacher-card/{id}`。本次不新增履歷檔案欄位、不新增履歷範本連結、不新增履歷審核流程。
5. **存摺封面與委任書是敏感個資，一律私有儲存。** 絕對不可沿用 `src/app/api/teacher-resumes/public/[token]/photo/route.ts` 的 `access: "public"` 寫法。
6. 每次驗收都要跑：`npx tsc --noEmit`、`npx eslint <改動檔案>`、`AUTH_SECRET=dummy-build-secret npx next build`。

---

## 第一階段（優先，目標：會計這個月就能用「發薪前提醒」）

### 步驟 1 — `Teacher` 欄位調整

新增欄位（全部 `String @default("")` 或 `Boolean @default(false)`）：

| 欄位 | 型別 | 用途 |
|---|---|---|
| `firstPaidMonth` | String @default("") | 第一次匯款月份，`""` = 從未匯款 |
| `lastPaidMonth` | String @default("") | 最後一次匯款月份，如 `2026-07` |
| `isCollegeStudent` | Boolean @default(false) | 是否為大學生 |
| `emergencyContact` | String @default("") | 緊急聯絡人 |
| `salaryNotes` | String @default("") | 薪資備註 |
| `bankRemitNotes` | String @default("") | 匯款備註 |
| `teachingSubjects` | String @default("") | 授課項目（複選，JSON 陣列字串） |

同時修改：

- `src/app/teachers/page.tsx:78` 的 `bankAccountName: form.name.trim()` — 改成可獨立編輯的欄位，預設帶入教師姓名但允許覆寫（實務上有代領、公司戶的情況）。
- `src/app/api/teachers/route.ts` GET 的遮罩格式：現在是 `末12345`，改成 `822-******1234`（`bankCode` + `******` + 帳號末四碼；`bankCode` 為空時只顯示 `******1234`）。
- 授課項目的選項來源接既有 `CourseOption` 表，不要另寫一份硬編清單。
- **不要移除** `src/lib/teacherTeachingProfile.ts` 的推斷邏輯（它從近 90 天出勤推授課項目，代課推薦 `rankTeacherForSubstitute` 依賴它）。新的 `teachingSubjects` 是「人工指定」，推斷值當作 fallback。

### 步驟 2 — 新表 `TeacherDocument` + 私有檔案通道

```
id INTEGER PK
teacherId INTEGER
docType TEXT        -- 本階段只用 'bankbook'
fileUrl TEXT        -- 私有 Blob 路徑，絕不送到前端
fileName TEXT
uploadedAt DATETIME
uploadedBy TEXT
reviewStatus TEXT   -- 未上傳 / 待審核 / 已完成 / 需補件
reviewedBy TEXT
reviewedAt DATETIME
notes TEXT          -- 需補件原因
UNIQUE(teacherId, docType)
```

端點：

- `POST /api/teacher-documents/upload` — 登入版（行政代傳），驗 `HR_DOCUMENT_ROLES`。
- `POST /api/teacher-documents/public/{token}` — 老師版，沿用 `src/lib/publicAccessToken.ts` 既有簽章機制，**不要另寫一套 token**。
- `GET /api/teacher-documents/{id}/file` — 後端驗 `SENSITIVE_FINANCE_ROLES` 後從私有 Blob 串流回傳。前端只拿得到這個網址。

限制：pdf / jpg / png，單檔 ≤ 10MB。每一次上傳、每一次檢視原檔、每一次狀態變更都要 `writeAuditLog(req, { ..., sensitive: true })`。

**這一步是安全關鍵，請獨立 commit 並做權限測試（用 customer_service 與 viewer 帳號各試一次讀取，必須 403）再往下走。**

### 步驟 3 — 老師端上傳頁 + 行政審核 UI

- `/teacher-documents/{token}`（免登入）：本階段只顯示「存摺封面」一張卡片，可上傳、可看目前狀態與需補件原因、可重傳。
- `/teachers/{id}` 加「文件」區塊：顯示存摺狀態、「產生上傳連結」按鈕、檢視原檔（燈箱）、標記「已完成」／「需補件」+ 填原因。
- 標記需補件時發 LINE 通知給老師，連結維持有效。

### 步驟 4 — `teacherPayoutReadiness()` 共用判斷函式

新檔 `src/lib/teacherPayoutReadiness.ts`。**`/salary`、`/accounting-center`、Excel 匯出三處必須呼叫同一支**，不要各自判斷。

```ts
export type PayoutReadiness = {
  level: "ok" | "warn" | "block";
  code: "paid" | "first_time" | "bank_changed" | "missing_bank" | "missing_bankbook";
  label: string;   // 畫面直接用的文字
  detail: string;  // hover／展開時的說明
};

export function teacherPayoutReadiness(input: {
  bankName: string;
  bankAccountNumber: string;
  bankAccountName: string;
  firstPaidMonth: string;
  lastPaidMonth: string;
  bankbookStatus: string;      // TeacherDocument(bankbook).reviewStatus
  bankChangedAt: Date | null;  // 由 AuditLog 算出的最後一次銀行資料異動時間
  lastPaidAt: Date | null;     // lastPaidMonth 對應的實際標記時間
}): PayoutReadiness
```

判斷優先序（**先檢查可行動的 ❌，再檢查較模糊的 ⚠️**）：

| 順序 | 條件 | code | level | label |
|---|---|---|---|---|
| 1 | `bankName` / `bankAccountNumber` / `bankAccountName` 任一為空 | `missing_bank` | block | ❌ 缺少銀行帳號 |
| 2 | `bankbookStatus` 非「已完成」 | `missing_bankbook` | block | ❌ 尚未上傳存摺 |
| 3 | `firstPaidMonth === ""` | `first_time` | warn | ⚠️ 首次匯款，請確認資料 |
| 4 | `bankChangedAt` 晚於 `lastPaidAt` | `bank_changed` | warn | ⚠️ 銀行資料已變更，請重新確認 |
| 5 | 其餘 | `paid` | ok | ✓ 已有匯款紀錄 |

**銀行異動偵測不需要新欄位。** `AuditLog` 已完整保存每次教師資料異動的 `beforeData` / `afterData`（JSON）與 `createdAt`，且系統沒有任何清除機制。查 `targetType = 'Teacher'`、`targetId = {id}`，找出 `beforeData`／`afterData` 中 `bankName`／`bankCode`／`bankBranch`／`bankAccountName`／`bankAccountNumber` 任一有差異的最新一筆，取其 `createdAt`。

### 步驟 5 — 基準線回填工具（**不可跳過**）

一次性工具頁，照既有 `/setup/waiting-teacher-dry-run` 的「先 dry-run 再執行」模式：列出所有老師，預設勾選「最近一次 `PayrollRun` 快照中有金額」的人，會計確認後批次寫入 `firstPaidMonth` / `lastPaidMonth`，並寫 `AuditLog`。

理由：不做回填的話，第一個月會跳出滿畫面的「首次匯款」假警報，會計看兩次就會開始無視這個提醒，功能等於白做。

### 步驟 6 — `/salary` 頁整合

每位老師列上顯示：姓名 / 本月應付金額 / 遮罩後銀行帳號 / 存摺狀態 / `teacherPayoutReadiness()` 的狀態標籤 / 「查看教師匯款資料」連結 / 「標記已匯款」就地按鈕。

- 頁首加匯總列：「本月 N 位老師需先確認匯款資料（❌ x 位 / ⚠️ y 位）」。
- 「標記已匯款」：若 `firstPaidMonth` 為空則一併寫入，`lastPaidMonth` 一律更新為當期月份，寫 `AuditLog`。支援勾選多列批次標記。
- 銀行帳號預設遮罩，每列有「顯示」按鈕，點一次解一列並寫 `AuditLog`。**不要整頁明碼。**

做完 1～6，發薪前提醒即完整可用。

---

## 第二階段（其餘管理需求）

### 步驟 7 — `AppSetting` 表 + 設定頁

`key` (PK) / `value` / `updatedBy` / `updatedAt`。初始兩筆：`doc.template.mandate.url`、`doc.template.bankbook.hint`。管理者在 `/settings` 維護，**連結不可寫死在程式裡**。（履歷不需要範本連結。）

### 步驟 8 — `TeacherDocument` 擴充 `mandate`

委任書要兩段審核：`待審核` → `行政已確認` → `已完成`（規格是「行政先確認內容 → 會計或管理者再確認」）。老師端頁面加第二張卡片，含「下載空白格式」按鈕（讀 `AppSetting`）。

### 步驟 9 — 教師列表文件狀態欄 + 待補件篩選

列表直接顯示：履歷（讀既有 `TeacherResume.status`：未填寫／草稿／已填寫，唯讀，可連到名片頁）、存摺（未上傳／待審核／已完成／需補件）、委任書（同存摺）。加「待補件教師」分頁，條件為任一 `TeacherDocument.reviewStatus` 為 `需補件` 或 `未上傳`。

### 步驟 10 — `/accounting-center` 會計資料中心

篩選：教師姓名、是否大學生、授課項目、薪資月份、文件是否完成、薪資是否已確認、是否已付款。

欄位對應：

| 顯示 | 來源 |
|---|---|
| 教師姓名 | `Teacher.name` |
| 是否大學生 | `Teacher.isCollegeStudent` |
| 授課項目 | `Teacher.teachingSubjects` |
| 時薪 | `rateAfterSchool` / `rateInSchool` / `rateDemo` |
| 銀行名稱／帳號／戶名 | `Teacher.*`，預設遮罩，點「顯示」解一列並寫稽核 |
| 存摺／委任書 | `TeacherDocument`，圖示 + 狀態，點擊開燈箱 |
| 履歷 | `TeacherResume.status`，唯讀 |
| 每月授課堂數 / 應付薪資 | `calculateSalaryMonth()` 的明細筆數 / `total` |
| 匯款狀態 | `firstPaidMonth` / `lastPaidMonth` + `teacherPayoutReadiness()` |

表頭右上角常駐匯出鈕，匯出的是**當下篩選結果**，不是全部。

### 步驟 11 — Excel 匯出擴充

在既有 `/api/export/salary`（ExcelJS）加銀行欄位：教師姓名、銀行名稱、分行名稱、銀行帳號、戶名、時薪、授課堂數、應付金額、薪資月份、付款狀態、備註。**含明碼銀行帳號的匯出僅限 `SENSITIVE_FINANCE_ROLES`，且每次匯出寫 `AuditLog(sensitive: true)`。** 其他角色匯出時銀行欄位維持遮罩。

---

## 權限（`src/lib/permissions.ts`）

**不需要新增角色**（`accountant` 已存在）。新增兩組：

```ts
// 可查看完整銀行帳號、存摺封面、委任書原檔
export const SENSITIVE_FINANCE_ROLES = ["owner", "super_admin", "developer", "accountant"] as const;
// 可查看教師文件「狀態」（不含檔案內容）、可審核委任書
export const HR_DOCUMENT_ROLES = ["owner", "super_admin", "developer", "admin", "staff", "accountant"] as const;
```

| 角色 | 教師基本資料 | 文件狀態 | 完整銀行帳號 | 存摺／委任書原檔 | 會計資料中心 | 含銀行的 Excel |
|---|---|---|---|---|---|---|
| owner / super_admin / developer | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| accountant | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| admin / staff | ✓ | ✓ | ✗（遮罩） | ✗ | ✗ | ✗ |
| customer_service | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| viewer | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |

一併調整的既有行為：

1. `SALARY_ROLES` 含 `admin` 與 `staff`，代表行政現在看得到（遮罩後的）銀行欄位——這維持不變，但**明碼**改由 `SENSITIVE_FINANCE_ROLES` 把關。
2. `accountant` 目前不在 `ADMIN_ROLES` 也不在 `NOTIFY_ROLES`，所以 `/api/teachers` 的 `canSeeContact` 會把電話與 Email 濾掉。會計要看得到聯絡方式，需在 `canSeeContact` 加上 `accountant`。
