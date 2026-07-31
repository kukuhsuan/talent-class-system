# 教師資料與會計管理－現況盤點與修改規劃

盤點時間：2026-07-31
盤點範圍：`prisma/schema.prisma`、`src/app/teachers`、`src/app/teacher-resumes`、`src/app/teacher-resume/[token]`、`src/app/teacher-card`、`src/app/salary`、`src/app/accounting`、`src/app/api/export/salary`、`src/lib/permissions.ts`、`src/lib/teacherResume.ts`、`src/lib/payrollRun.ts`

> 本文件是「動工前的確認稿」。請先確認第 0 節的決策點，再依第 1～7 節開始改程式。
>
> 2026-07-31 修訂：依「發薪前提醒」需求調整——取消 `TeacherPayout` 表，改為 `Teacher` 兩個欄位；新增第 7 節；施工順序改為兩階段。

---

## 0. 需要你先拍板的決策點

盤點後發現規格與系統現況有幾處對不上。**0-1 ～ 0-4 已全部拍板**，以下記錄結論與理由；0-5 不需決策。

### 0-1. 履歷 —— ✅ 已拍板：維持線上表單，**不做**履歷檔案上下載

系統**已經有一整套履歷功能**：行政產生一條簽章連結傳給老師（`/teacher-resume/{token}`），老師在網頁上直接填學歷、教學經歷、教學風格、專長、自我介紹、證照並上傳大頭照，送出後自動生成「教師名片」頁（`/teacher-card/{teacherId}`）。

規格原本要的是「下載 Word/PDF 格式 → 自己填 → 上傳檔案回來」。**此案不做**，理由是履歷檔案（含身分資料、住址、聯絡方式等自由填寫內容）以檔案形式流通有資訊安全疑慮，且現行線上表單的欄位是系統控制的，可控範圍明確。

**本文件其餘章節據此調整**：`TeacherDocument` 只處理 `bankbook`（存摺封面）與 `mandate`（委任書）兩種，不含 `resume`；`AppSetting` 只需要委任書格式的下載連結；文件完成狀態的「履歷」一欄沿用既有 `TeacherResume.status`（未填寫／草稿／已填寫），不新增審核流程。

### 0-2. 時薪 —— ✅ 已拍板：**維持現況**（四個費率欄位不動）

`Teacher` 目前有四個費率欄位，而且薪資計算引擎（`src/lib/salaryCalculation.ts`）是真的分開在算：

- `rateAfterSchool` 課後時薪（預設 500）
- `rateInSchool` 課內時薪（預設 500）
- `rateDemo` Demo 時薪（預設 200）
- `assistantFee` 助教時薪
- `travelFee` 每節車費

規格說「不要設計不同薪資類型，只保留時薪」。這裡有歧義：

- 如果意思是「不要有月薪／件計這種**薪資類型**，大家都是時薪」→ **現況已符合**，四個費率只是不同課別的單價，不用動。
- 如果意思是「一個老師只有**一個**時薪數字，課後課內 Demo 都同價」→ 這會**改動薪資計算核心**，過去已結算的月份、`PayrollRun` 快照、匯出報表都會受影響，風險高。

**定案**：維持四個費率欄位不動（它們就是時薪，不是不同薪資類型），只在畫面上把它們收攏成「時薪設定」一個區塊，並新增「薪資備註」欄位。**不合併成單一時薪**——那會改動薪資計算核心並讓已結算月份的 `PayrollRun` 快照對不上。

### 0-3. 存摺封面 —— ✅ 已拍板：採私有儲存 + 後端代理 + 稽核記錄

現有的照片上傳（`src/app/api/teacher-resumes/public/[token]/photo/route.ts`）用的是 Vercel Blob 且 `access: "public"`——也就是**只要拿到網址，任何人不用登入都看得到**。大頭照這樣沒問題，**存摺封面和委任書絕對不行**。

新的敏感檔案上傳必須改成：檔案存私有 Blob，前端只拿得到 `/api/teacher-documents/{id}/file` 這種代理網址，由後端驗權限後才串流檔案內容，並寫 `AuditLog`（誰在什麼時候看了誰的存摺）。

### 0-4. 匯款紀錄 —— ✅ 已拍板：`Teacher` 加兩欄 + 上線基準線回填，**不建 `TeacherPayout`**

這是本次需求的核心判斷條件，但必須先講明白：**系統從來沒有記錄過「某位老師的主薪資已匯款」。**

現有的三個相近資料，沒有一個能直接拿來用：

| 現有資料 | 為什麼不能直接當「已匯款」 |
|---|---|
| `PayrollRun`（月結算快照） | 結算只是把數字鎖定，**不代表錢已經轉出去**。而且 `unlockPayrollMonth()` 會**直接 DELETE 該筆紀錄**——只要解鎖過一次，那個月的歷史就消失，老師會突然變回「首次匯款」。另外這是 M14 才加的功能，之前的月份根本沒有資料，一上線所有資深老師都會被誤標成「首次匯款」。 |
| `SalaryAdjustment.isPaid` | 只管補發／扣款這種調整項，跟主薪資無關。 |
| `Attendance.isPayrollLocked` | 同 `PayrollRun`，是鎖定不是付款。 |

所以「完全不新增東西」做不到——資料不存在就是不存在，硬推斷只會製造一堆假警報，反而讓會計對提醒失去信任（每個月都跳一堆「首次匯款」，看兩次就開始無視了）。

**但你的判斷是對的：不需要整張 `TeacherPayout` 表。** 只要在 `Teacher` 上加**兩個欄位**就夠了：

```prisma
firstPaidMonth String @default("")   // 第一次匯款的月份，用來判斷「是否曾經匯過款」
lastPaidMonth  String @default("")   // 最後一次確認匯款的月份，例如 "2026-07"
```

會計在薪資頁按「標記已匯款」時寫入；上線時做一次基準線回填（會計勾選「這些老師以前都領過了」，或直接以最近一次 `PayrollRun` 快照裡有金額的老師批次帶入）。

這比 `TeacherPayout` 輕非常多（兩個欄位 vs 一張表 + 一組 CRUD API），而且記的是**真正的匯款事實**，不是從結算狀態推斷出來的。

未來若真需要付款批次、付款失敗原因、重新匯款紀錄、逐月確認人，再升級成 `TeacherPayout`——屆時這兩個欄位可直接當歷史資料遷移過去。

### 0-5. 好消息：「銀行資料曾被修改」不用新增任何欄位

`AuditLog` 已經完整記錄每次老師資料異動的 `beforeData` / `afterData`（完整 JSON）與 `createdAt`，而且系統**沒有任何清除或保留期機制**，資料是永久的。

所以只要查 `targetType = 'Teacher' AND action = 'update'`，比對前後的 `bankName` / `bankCode` / `bankBranch` / `bankAccountNumber` / `bankAccountName`，就能算出每位老師「最後一次改銀行資料的時間」。拿它跟 `lastPaidMonth` 一比，就知道要不要跳「⚠️ 銀行資料已變更，請重新確認」。

零新增欄位，直接用既有稽核記錄。

---

## 1. 目前已存在的功能（可直接整合，不要重建）

| 功能 | 位置 | 說明 |
|---|---|---|
| 老師管理頁 | `/teachers`、`src/app/api/teachers` | 基本資料、四種時薪、車費、匯款資料的新增／編輯／刪除 |
| 匯款資料 | `Teacher.bankName/bankCode/bankBranch/bankAccountName/bankAccountNumber` | 欄位已存在 |
| 匯款帳號遮罩 | `src/app/api/teachers/route.ts` GET | 已有，但格式是 `末12345`，不是規格的 `822-******1234` |
| 個資分級 | 同上 | 銀行欄位限 `SALARY_ROLES`；LINE ID 限 `NOTIFY_ROLES`；電話／Email 限 `ADMIN_ROLES ∪ NOTIFY_ROLES` |
| 履歷（線上表單） | `/teacher-resumes`、`/teacher-resume/[token]`、`src/lib/teacherResume.ts` | `TeacherResume` 表：學歷、經歷、教學風格、專長、自介、證照、照片、狀態（未填寫／草稿／已填寫）。**0-1 已定案沿用此機制，不改成檔案上下載** |
| 履歷收集連結 | `src/lib/publicAccessToken.ts` | 已有簽章 token 機制，老師免登入即可填寫，可直接沿用到「文件上傳」 |
| 教師名片 | `/teacher-card/[teacherId]` | 由履歷資料自動生成 |
| 檔案上傳 | `@vercel/blob` | 已導入，但目前只用 `access: "public"` |
| 薪資計算 | `/salary`、`src/lib/salaryCalculation.ts` | 逐月計算時數、金額、車費、補發扣款 |
| 薪資月結算鎖定 | `src/lib/payrollRun.ts` | `finalizePayrollMonth` / `unlockPayrollMonth` |
| 補發／扣款付款狀態 | `SalaryAdjustment.isPaid` / `paidAt` | 只涵蓋調整項 |
| 薪資 Excel 匯出 | `/api/export/salary`（ExcelJS） | 兩個工作表：月總表 + 薪資明細。**目前不含銀行欄位** |
| 月底會計包 | `/accounting`、`/api/accounting-month-end` | 已有 xlsx 匯出與待辦阻塞清單 |
| 權限系統 | `src/lib/permissions.ts` | 已有 `accountant` 角色；`SALARY_ROLES` 已含 accountant |
| 稽核記錄 | `src/lib/auditLog.ts` | `writeAuditLog(..., { sensitive: true })` 已在用 |

**結論：不需要新建教師資料表、不需要新建 Excel 匯出模組、不需要新建權限系統。**

---

## 2. 需要修改的欄位

### 2-1. `Teacher` 表：規格要移除的欄位，其實大多**本來就不存在**

規格列的移除清單裡，以下欄位**系統從來沒有**，不用動作：性別、生日、身分證字號、居住地址、居住地區、可授課地區、教師等級、合作開始日期、合作狀態。

實際存在、需要處理的只有這些：

| 欄位 | 現況 | 建議 |
|---|---|---|
| `lineUserId` / `lineBindCode` / `lineRegion` | 存在 | **不可移除**。這是 LINE 推播的技術欄位（課表查詢、代課詢問、薪資通知全靠它），不是「LINE ID 聯絡方式」。建議從「基本資料」區塊移到「系統設定」區塊並收合，畫面上不再當成一般欄位。 |
| `rateAfterSchool` / `rateInSchool` / `rateDemo` / `travelFee` / `assistantFee` | 存在 | 依 0-2 決策。建議保留，畫面收攏成「時薪設定」 |
| `bankAccountName` | 存在，但**寫死等於老師姓名**（`src/app/teachers/page.tsx:78`） | 改成可編輯欄位，預設帶入姓名（實務上常有戶名≠姓名的狀況） |

### 2-2. 匯款帳號遮罩格式

現況 `末12345` → 改為規格的 `822-******1234`（銀行代碼 + 遮罩 + 末四碼）。集中成一個 `maskBankAccount()` 共用函式，避免各頁自己實作。

### 2-3. 教學資料：「授課項目」目前是**推測出來的**，不是老師填的

`src/lib/teacherTeachingProfile.ts` 目前是從**近 90 天出勤紀錄反推**老師的主要課程類型與專長（舞蹈／運動）。這是代課媒合用的，準確度取決於有沒有排課，新老師會顯示「尚無排課紀錄」。

規格要的是**可複選、由行政或老師自己填**的授課項目。這是新欄位（見第 3 節），但**不要移除** `teacherTeachingProfile`——代課詢問排序（`rankTeacherForSubstitute`）在用它。兩者並存：填寫的當主、推測的當輔助參考。

### 2-4. 薪資 Excel 匯出欄位

`/api/export/salary` 現有欄位不含銀行資訊。需新增：銀行名稱、分行名稱、銀行帳號（**完整，不遮罩**）、戶名、時薪、付款狀態、備註。

因為含完整帳號，這個匯出必須：限 `SALARY_ROLES`、每次匯出寫 `AuditLog`、檔名帶月份與匯出人。

---

## 3. 需要新增的欄位

### 3-1. `Teacher` 表新增欄位

| 欄位 | 型別 | 說明 |
|---|---|---|
| `emergencyContact` | String @default("") | 緊急聯絡人姓名 |
| `emergencyPhone` | String @default("") | 緊急聯絡人電話（規格沒列，但只有姓名沒電話沒有意義，建議一起加） |
| `isCollegeStudent` | Boolean @default(false) | 是否為大學生 |
| `salaryNotes` | String @default("") | 薪資備註 |
| `bankRemitNotes` | String @default("") | 匯款備註 |
| `teachingSubjects` | String @default("") | 授課項目，複選，以 JSON 陣列或逗號分隔字串儲存 |
| `teachingExperience` | — | **不新增**，沿用既有 `TeacherResume.experience`（0-1 已定案維持線上表單） |
| `certifications` | — | **不新增**，沿用既有 `TeacherResume.certifications` |

`notes`（備註）已存在，不用新增。

> 授課項目的選項來源建議接既有的 `CourseOption` 表，不要另外寫死一份清單。

### 3-2. 新表 `TeacherDocument`（存摺封面／委任書共用）

一張表處理兩種文件，避免開兩張結構相同的表（**不含履歷**，見 0-1）：

| 欄位 | 型別 | 說明 |
|---|---|---|
| `id` | Int PK | |
| `teacherId` | Int | |
| `docType` | String | `bankbook`（存摺封面）／`mandate`（委任書） |
| `fileUrl` | String | 私有 Blob 路徑（**不直接給前端**） |
| `fileName` | String | 原始檔名 |
| `uploadedAt` | DateTime | 上傳日期 |
| `uploadedBy` | String | 老師自傳或行政代傳 |
| `reviewStatus` | String | `未上傳`／`待審核`／`已完成`／`需補件` |
| `reviewedBy` | String | 審核人員 |
| `reviewedAt` | DateTime? | |
| `notes` | String | 備註（需補件時寫原因） |

唯一索引 `(teacherId, docType)`。

> 注意：規格中「存摺」的狀態是「未上傳／已上傳／需補件」，委任書是「未完成／待審核／已完成／需補件」。建議**兩者統一**用同一組狀態，畫面上存摺的「已上傳」顯示為「待審核」即可，減少邏輯分支。

### 3-3. 新表 `AppSetting`（放文件格式下載連結）

規格明確要求「不要把連結寫死在程式裡，管理者可隨時更換」。目前系統**沒有**任何通用設定表。

| 欄位 | 型別 |
|---|---|
| `key` | String PK |
| `value` | String |
| `updatedBy` | String |
| `updatedAt` | DateTime |

初始兩筆：`doc.template.mandate.url`、`doc.template.bankbook.hint`（存摺不需範本，放說明文字）。履歷不需要範本連結（0-1 已定案）。

管理者在 `/users` 或新的 `/settings` 頁維護。

### 3-4. 匯款紀錄：`Teacher` 加兩個欄位就好，**不建 `TeacherPayout`**（見 0-4）

| 欄位 | 型別 | 說明 |
|---|---|---|
| `firstPaidMonth` | String @default("") | 第一次匯款月份，`""` 代表從未匯款過 |
| `lastPaidMonth` | String @default("") | 最後一次匯款月份，例如 `2026-07` |

寫入時機：會計在薪資頁按「標記已匯款」→ 若 `firstPaidMonth` 為空則一併寫入，`lastPaidMonth` 一律更新為當期月份。整個動作寫 `AuditLog`。

**上線基準線回填（很重要，不做的話第一個月會跳滿畫面的假警報）**：
提供一次性工具頁（比照既有的 `/setup/waiting-teacher-dry-run` 模式，先 dry-run 再執行），列出所有老師，預設勾選「最近一次 `PayrollRun` 快照中有金額」的人，會計確認後批次寫入 `firstPaidMonth` / `lastPaidMonth`。

> 依現有慣例，若之後真的要建 `TeacherPayout`，用 `CREATE TABLE IF NOT EXISTS` 的 `ensureXxxTable()` 建立（如 `payrollRun.ts`、`teacherResume.ts`），不走 prisma migrate，因為正式環境在 Turso。`Teacher` 新增欄位同理，需要一支 `ALTER TABLE ... ADD COLUMN`（可比照 `attendanceTime.ts` 的 `ensureAttendanceScheduledTimeColumn()` 寫法）。

### 3-5. 存摺封面：第一階段可以只做 `bankbook` 一種文件

第 3-2 節的 `TeacherDocument` 是存摺／委任書共用的通用表。若想先讓「發薪前提醒」上線，可以**只實作 `docType = 'bankbook'`**，委任書之後再接——表結構不用改，只是先少一種類型。

不建議為了更快而把存摺塞成 `Teacher.bankbookUrl` 兩個欄位：那樣就沒有審核狀態、沒有需補件原因、之後接委任書時還要再重構一次。通用表現在多花的成本很小。

---

## 4. 需要新增的權限

現有角色：`owner`／`super_admin`／`developer`／`admin`／`staff`／`customer_service`／`accountant`／`viewer`。**不需要新增角色**，只需要新增權限群組。

在 `src/lib/permissions.ts` 新增兩組：

```ts
// 可查看完整銀行帳號、存摺封面、委任書原檔
export const SENSITIVE_FINANCE_ROLES = ["owner", "super_admin", "developer", "accountant"] as const;
// 可查看教師文件「狀態」（不含檔案內容）、可審核委任書
export const HR_DOCUMENT_ROLES = ["owner", "super_admin", "developer", "admin", "staff", "accountant"] as const;
```

對應規格的權限矩陣：

| 角色 | 教師基本資料 | 文件狀態 | 完整銀行帳號 | 存摺／委任書原檔 | 會計資料中心 | Excel 匯出 |
|---|---|---|---|---|---|---|
| owner / super_admin / developer | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| accountant 會計 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| admin / staff 行政人資 | ✓ | ✓ | ✗（遮罩） | ✗ | ✗ | ✗ |
| customer_service 客服 | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| viewer | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |

需要一併調整的既有行為：

1. `SALARY_ROLES` 目前含 `admin` 與 `staff`，代表行政現在**看得到銀行欄位**（雖然是遮罩後的）。銀行**明碼**要改用新的 `SENSITIVE_FINANCE_ROLES` 把關。
2. `accountant` 目前**不在** `ADMIN_ROLES` 也不在 `NOTIFY_ROLES`，所以 `/api/teachers` 會把電話與 Email 濾掉。會計要看得到聯絡方式的話，`canSeeContact` 要加上 `accountant`。
3. 存摺／委任書檔案的每一次讀取都要 `writeAuditLog({ sensitive: true })`。

---

## 5. 會計資料中心（`/accounting-center`）畫面規劃

新頁面，掛在導覽列「財務」群組，與既有的 `/accounting`（月底會計包）並列。**不取代** `/accounting`——那頁是月結流程檢核，這頁是老師付款作業。

### 版面

```
┌─ 會計資料中心 ────────────────────────── [薪資月份 2026-08 ▾] [匯出 Excel] ┐
│                                                                          │
│ 篩選：[老師姓名 🔍] [大學生 全部▾] [授課項目 全部▾]                          │
│       [文件 全部▾] [薪資 全部▾] [付款 全部▾]                               │
│                                                                          │
│ ┌ 統計列 ────────────────────────────────────────────────────────────┐  │
│ │ 老師 42 人 · 應付總額 $386,500 · 已確認 30 · 已付款 12 · 待補件 7   │  │
│ └────────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│ 姓名   大學生 授課項目      時薪      銀行/帳號        文件      堂數 應付    確認   付款│
│ ─────────────────────────────────────────────────────────────────────── │
│ 林詩恩  是   體能·籃球   500/500/200 中國信託         履✓存✓委✓  18  $13,500 [已確認] [付款]│
│                                     822-******1234                       │
│ 邱建庭  否   舞蹈        520/500/200 玉山銀行         履✓存✗委⚠  22  $17,160 [確認]  [未付款]│
│                                     808-******5678   ↑點狀態可看原檔      │
└──────────────────────────────────────────────────────────────────────────┘
```

### 欄位對應

| 顯示欄位 | 資料來源 |
|---|---|
| 教師姓名 | `Teacher.name` |
| 是否大學生 | `Teacher.isCollegeStudent`（新增） |
| 授課項目 | `Teacher.teachingSubjects`（新增） |
| 時薪 | `Teacher.rateAfterSchool` / `rateInSchool` / `rateDemo` |
| 銀行名稱 / 帳號 / 戶名 | `Teacher.bankName` / `bankAccountNumber` / `bankAccountName`，**預設遮罩**，點「顯示」才解遮罩並寫稽核 |
| 存摺／委任書 | `TeacherDocument`（新增），以圖示 + 狀態呈現，點擊開燈箱看原檔 |
| 履歷 | 既有 `TeacherResume.status`（未填寫／草稿／已填寫），唯讀顯示 + 連到名片頁 |
| 每月授課堂數 | `calculateSalaryMonth()` 的明細筆數 |
| 每月應付薪資 | `calculateSalaryMonth()` 的 `total` |
| 匯款狀態 | `Teacher.firstPaidMonth` / `lastPaidMonth`（新增），可就地按「標記已匯款」 |
| 發薪前提醒 | 由 `teacherPayoutReadiness()` 計算，見第 7 節 |

### 互動要點

- 銀行帳號預設遮罩，每列有「顯示」按鈕；點一次解一列，並記 `AuditLog`。不要整頁明碼。
- 「標記已匯款」用就地按鈕，改完立即寫入，不要另開表單。
- 支援批次：勾選多列 → 「批次標記已匯款」。
- 表頭右上角常駐匯出鈕，匯出的是**當下篩選結果**，不是全部。

---

## 6. 文件下載與上傳流程

**履歷不走這條流程**（0-1 已定案，維持既有線上表單 `/teacher-resume/{token}`）。以下只涵蓋存摺封面與委任書兩種 `docType`。

```
【管理者】一次性設定
  /settings → 貼上「委任書格式」的下載連結
            → 寫入 AppSetting（可隨時更換，程式不寫死）

【行政】
  /teachers/{id} → 文件區塊 → 點「產生上傳連結」
                 → 系統用既有的 signTeacherResumeToken 機制產生簽章連結
                 → 用 LINE 或 Email 傳給老師

【老師】（免登入，憑 token）
  開啟 /teacher-documents/{token}
    ├─ 看到兩張卡片：存摺封面 / 委任書
    ├─ 委任書卡片上有「下載空白格式」按鈕（讀 AppSetting 的連結）
    ├─ 下載 → 自己填寫 → 回到同一頁上傳
    └─ 上傳（pdf/jpg/png，單檔 ≤ 10MB）
        → 存私有 Blob
        → TeacherDocument.reviewStatus = 待審核，記 uploadedAt / uploadedBy

【行政】初審
  /teachers/{id} 或待補件清單 → 檢視原檔
    → 完整 → 委任書標記「行政已確認」；存摺標記「已完成」
    → 不完整 → 標記「需補件」+ 填原因 → 老師收到 LINE 通知，連結仍有效可重傳

【會計／管理者】複審委任書
  /accounting-center → 檢視原檔 → 標記「已完成」或「需補件」
  （規格的委任書流程是「行政先確認內容 → 會計或管理者再確認」，
    因此委任書狀態需要兩段：待審核 → 行政已確認 → 已完成）

【全程】
  每一次檢視原檔、每一次狀態變更 → writeAuditLog(sensitive: true)
```

### 技術細節

- **上傳端點**：`POST /api/teacher-documents/upload`（登入版，行政代傳）與 `POST /api/teacher-documents/public/{token}`（老師版）。
- **讀取端點**：`GET /api/teacher-documents/{id}/file`，後端驗 `SENSITIVE_FINANCE_ROLES`（存摺／委任書原檔），通過才從 Blob 串流回傳。**絕不把 Blob 原始網址送到前端。**
- **token 沿用** `src/lib/publicAccessToken.ts` 既有機制，不要另寫一套。
- **待補件篩選**：教師列表加一個「待補件教師」分頁，條件為任一 `TeacherDocument.reviewStatus` 為 `需補件` 或 `未上傳`。

---

## 7. 發薪前提醒（本次需求核心）

### 7-1. 一個共用函式，兩個頁面共用

在 `src/lib/teacherPayoutReadiness.ts` 實作單一判斷函式，`/salary`（薪資明細）與 `/accounting-center`（會計中心）以及 Excel 匯出**全部呼叫同一支**，避免三個地方各判斷一套、狀態不一致。

```ts
export type PayoutReadiness = {
  level: "ok" | "warn" | "block";
  code: "paid" | "first_time" | "bank_changed" | "missing_bank" | "missing_bankbook";
  label: string;   // 給畫面直接用的文字
  detail: string;  // hover 或展開時的說明
};

export function teacherPayoutReadiness(input: {
  bankName: string;
  bankAccountNumber: string;
  bankAccountName: string;
  firstPaidMonth: string;
  lastPaidMonth: string;
  bankbookStatus: string;          // TeacherDocument(bankbook).reviewStatus
  bankChangedAt: Date | null;      // 從 AuditLog 算出來的最後一次銀行資料異動時間
  lastPaidAt: Date | null;         // lastPaidMonth 對應的實際標記時間
}): PayoutReadiness
```

### 7-2. 判斷順序（由嚴到寬，先命中先回傳）

| 順位 | 條件 | level | 顯示 |
|---|---|---|---|
| 1 | 銀行名稱／帳號／戶名 任一為空 | `block` | ❌ 缺少銀行帳號 |
| 2 | 存摺未上傳或狀態為「需補件」 | `block` | ❌ 尚未上傳存摺 |
| 3 | `firstPaidMonth` 為空（從未匯款） | `warn` | ⚠️ 首次匯款，請確認資料 |
| 4 | `bankChangedAt` 晚於 `lastPaidAt` | `warn` | ⚠️ 銀行資料已變更，請重新確認 |
| 5 | 其餘 | `ok` | ✓ 已有匯款紀錄 |

注意順位 1、2 要放在 3 前面——一位從未匯款又沒填帳號的新老師，應該看到「❌ 缺少銀行帳號」這個可行動的訊息，而不是比較籠統的「首次匯款」。

「有匯款紀錄但缺存摺」的舊老師也會被順位 2 攔下，這是刻意的：存摺缺件本來就該補。若實務上覺得太吵，可加一個「舊老師僅提示不阻擋」的例外，但建議先上線觀察一輪再決定。

### 7-3. 畫面呈現

`/salary` 每位老師那一列，在姓名旁加一個狀態標籤：

```
林詩恩   ✓ 已有匯款紀錄      18堂  $13,500   822-******1234  存摺✓  [標記已匯款]
王小明   ⚠️ 首次匯款，請確認資料  6堂  $4,200   808-******5678  存摺✓  [檢視匯款資料] [標記已匯款]
陳大文   ❌ 缺少銀行帳號       12堂  $9,000   ——              存摺✗  [前往補齊]
李美美   ⚠️ 銀行資料已變更     20堂  $15,000  013-******9876  存摺✓  [檢視變更] [標記已匯款]
```

- 頁面最上方放一條匯總：「本月 42 位老師應付 $386,500，其中 **3 位需先確認匯款資料**」，並可一鍵篩選只看有問題的。
- `block` 等級的老師，Excel 匯出時**照樣匯出但標紅並在備註欄註明原因**——不要靜默排除，會計會不知道少了誰。
- 「檢視變更」點開顯示 `AuditLog` 的前後對照（誰在什麼時候把帳號從 A 改成 B）。

### 7-4. 效能

`bankChangedAt` 需要掃 `AuditLog` 並解析 JSON。老師數量約 40 人，但 `AuditLog` 可能上萬筆，所以：

- 查詢限縮 `WHERE targetType = 'Teacher' AND action = 'update'`（`targetType` 已有索引）。
- 一次撈全部老師的紀錄後在記憶體分組，**不要每位老師發一次查詢**（N+1）。
- 只取每位老師最新一筆有銀行欄位差異的紀錄即可。
- 結果可在 request 層做 memoize；若之後真的變慢，再考慮在 `Teacher` 上加一個 `bankChangedAt` 欄位由 PUT 直接寫入（用空間換時間），但先不要提早最佳化。

---

## 附錄：建議施工順序

以「發薪前提醒盡快能用」為目標排序，切成兩階段。

### 第一階段：讓會計這個月就能用（1～6）

1. `Teacher` 新增欄位（`firstPaidMonth` / `lastPaidMonth` / `isCollegeStudent` / `emergencyContact` / `salaryNotes` / `bankRemitNotes` 等）+ `bankAccountName` 改為可編輯 + 遮罩格式統一成 `822-******1234`
2. `TeacherDocument` 表 + 私有 Blob 上傳／後端代理讀取 + 稽核（**先只做 `docType='bankbook'`**）
3. 老師端上傳頁（沿用既有簽章 token）+ 行政審核 UI
4. `teacherPayoutReadiness()` 共用判斷函式 + `AuditLog` 銀行異動偵測
5. 基準線回填工具（dry-run → 執行），把現有老師的 `firstPaidMonth` 補起來
6. `/salary` 頁加狀態標籤、匯總列、「標記已匯款」按鈕

做完 1～6，「發薪前提醒」就完整可用了。

### 第二階段：其餘管理需求（7～11）

7. `AppSetting` 表 + 設定頁（委任書格式下載連結）
8. `TeacherDocument` 擴充 `mandate` 類型 + 兩段審核流程（行政初審 → 會計複審）
9. 教師列表文件狀態欄 + 待補件篩選
10. `/accounting-center` 頁（含授課項目、大學生等篩選）
11. 薪資 Excel 匯出擴充銀行欄位（放最後，依賴前面全部）

第 2 步是安全關鍵（存摺是敏感個資），建議獨立一個 commit 並做過權限測試再往下走。

第 5 步不要跳過——沒有基準線回填，第一個月會跳出滿畫面的「首次匯款」假警報，會計看兩次就會開始無視這個提醒，功能等於白做。
