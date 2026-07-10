# 兒童才藝課程營運管理系統 — 完整健檢報告

- 審查日期：2026-07-10
- 審查方式：唯讀程式碼審查（未修改任何程式），涵蓋 middleware、全部 API route、lib、Prisma schema、cron、前端頁面
- 技術棧：Next.js 16 App Router + Prisma 7 + Turso(libSQL) + Vercel + LINE Messaging API

---

## A. 系統總健檢摘要

整體而言，這套系統的**安全基礎比多數同規模系統好**：後台全面要求登入（middleware JWT）、LINE webhook 有驗簽章、cron 有 CRON_SECRET、密碼用 scrypt、登入有 rate limit、審計 Log 欄位設計完整（含 before/after/IP/敏感標記）、備份 cron 存在、secrets 沒有寫死在程式碼、.env 沒進版控。

**最需要處理的三件事**：

1. **資安**：一個「免登入、用流水號就能查」的公開 API 會洩漏老師電話與 Email（`/api/teacher-resumes/card/[id]`）；共用密碼 `ADMIN_PASSWORD` 登入無法追責；課程刪除會**連鎖硬刪全部出勤紀錄**（含薪資依據），無軟刪除。
2. **速度**：慢的主因不是資料量，而是「執行期 ALTER TABLE 散佈在熱路徑」（每次請求對 Turso 多付 3–17 次無效網路往返）＋「LINE 通知同步擋在回應前」（老師送出回報要等整條通知鏈跑完）＋「/api/teachers 為了下拉選單掃 90 天全出勤」。
3. **營運抓漏**：狀態鏈大致是通的（代課確認會同步出勤、薪資會歸給實際上課者），但有 20+ 個「沒人看著的縫」：未回報課仍計薪（與 LINE 訊息宣示的政策矛盾）、代課老師事後 LINE 取消不會通知任何人、請款單快照過期無偵測、`schoolId` 為 null 的課**永遠不會被請款**、請假統計寫死 2026-02～08（**下個月就會壞**）。

---

## B. 高風險問題清單

| # | 問題 | 證據 | 影響 |
|---|------|------|------|
| B1 | 公開 API 以流水號洩漏老師個資：`/api/teacher-resumes/card/[teacherId]` 在 middleware PUBLIC_PREFIX 白名單內，免登入、teacherId 是連續整數可列舉，回傳內容含 `teacherPhone`、`teacherEmail`（`teacherResume.ts:91-96` SELECT 後整包 spread 回傳） | `src/middleware.ts:10`、`src/app/api/teacher-resumes/card/[teacherId]/route.ts:14`、`src/lib/teacherResume.ts:95-96` | 任何人寫個迴圈就能撈走全部老師電話與 Email |
| B2 | 課程刪除＝硬刪全部出勤：`DELETE /api/courses/[id]` 在 transaction 內 `attendance.deleteMany` + `course.delete`，出勤是薪資與請款的依據，刪了救不回（僅每日 email 備份可撈） | `src/app/api/courses/[id]/route.ts:239-240` | 誤刪一門課＝該課全部出勤、回報、打卡、代課紀錄消失 |
| B3 | 共用密碼登入：只要密碼等於 `ADMIN_PASSWORD` 即取得 admin 權限、身分記為 legacy-admin，無法追責到人；非 production 環境 fallback 為 `admin123` | `src/app/api/auth/login/route.ts:48-56` | 密碼外流＝整個後台淪陷且審計失去意義 |
| B4 | 請假學期統計寫死 `2026-02-01 ~ 2026-08-01`，2026-08 後請假次數統計歸零/錯誤 | `src/lib/teacherLeaves.ts:188-193` | 定時炸彈，下個月生效 |
| B5 | 未回報的課仍會計薪，但 LINE 提醒訊息明寫「未完成回報該堂課暫不列入薪資」——程式與政策矛盾 | `src/lib/salaryCalculation.ts:70-74`（只濾 cancelled）vs `src/lib/line.ts:385,467,887` | 薪資可能多發；老師與行政認知不一致 |
| B6 | `Course.schoolId` 為 null 且園所名稱字串比對不到時，該課**永遠不會出現在請款單**，且無任何報表提示 | `src/lib/schoolInvoices.ts:336-339`、schema `Course.schoolId?` | 直接漏收錢，靜默發生 |
| B7 | 大量業務表為執行期 `CREATE TABLE`（TeacherLeaveRequest、SubstituteInquiry、SchoolInvoice 明細、TeacherResume、AttendanceEquipment 等），**無外鍵約束**，孤兒資料無防護；且與 prisma migration 雙軌並存 | `src/lib/teacherLeaves.ts:134-186`、`teacherResume.ts:62-86`、`schoolInvoices.ts:238-314` | 資料完整性靠應用層自律；也是效能問題主因（見 H） |

## C. 中風險問題清單

| # | 問題 | 證據 |
|---|------|------|
| C1 | 大多數 API route 只靠 middleware 一層防護，route 內無二次角色檢查（約 60 支 route 沒用 `requireRole`，僅 16 支有）。middleware 目前有涵蓋，但只要 PUBLIC_PREFIX 或 matcher 改壞一次就整片裸奔 | `src/lib/permissions.ts` 使用率統計 |
| C2 | viewer/staff 角色可透過 `/api/teachers` 看到老師電話、Email、時薪、銀行名稱/分行（僅帳號帳名被遮罩），無欄位級權限 | `src/app/api/teachers/route.ts:6-19` |
| C3 | 登入 rate limit 存在記憶體 Map 中，Vercel serverless 每個實例各自計數、cold start 歸零，防護有限 | `src/app/api/auth/login/route.ts:7-31` |
| C4 | JWT 7 天效期、logout 只清 cookie 無黑名單。`currentSessionUser()` 有查 DB 讓停用帳號立即失效，但**只有用到 requireRole 的 16 支 route 受惠**；middleware 只驗 JWT，被停用的帳號仍可用舊 token 打其餘 API 七天 | `src/lib/auth.ts:11`、`src/middleware.ts` |
| C5 | 公開 token（回報/評量/簡歷/招募）效期 90–180 天、與後台共用同一把 `AUTH_SECRET`、除園所 portal 有 tokenVersion 外其餘**無撤銷機制** | `src/lib/publicAccessToken.ts`、`schoolPortalToken.ts` |
| C6 | 15 支 DELETE API 全是硬刪除，前端只有 `confirm()` 防呆，無軟刪除/回收桶 | grep DELETE 清單、`courses/page.tsx:383` |
| C7 | 代課老師事後在 LINE 按「取消代課」只改 inquiry 狀態，不通知行政、不退回請假流程，出勤仍掛該老師 | `src/lib/lineWebhook.ts:629-641` |
| C8 | confirm-substitute 分兩段交易：出勤已換人但請假狀態更新失敗時會出現狀態不一致 | `api/teacher-leaves/[id]/confirm-substitute/route.ts:37-57` |
| C9 | 請款單為快照，出勤事後被改（人數/取消）不會標記過期；「當月有出勤但沒開請款單」也無偵測 | `src/lib/schoolInvoices.ts:453-536` |
| C10 | 薪資無快照表（無 PayrollRun），薪資單寄出後、上鎖前出勤被改即對不起來；上鎖是手動 setup API | `src/lib/salaryCalculation.ts`、`api/setup/payroll-lock` |
| C11 | 備份 cron 是把**全庫敏感資料 JSON**（老師銀行資料、園所、出勤）寄到 Gmail 信箱，Gmail 帳號成為單點風險；且無還原演練機制 | `src/app/api/cron/backup/route.ts:100` |
| C12 | cron reminder 接受 querystring 傳 secret（`?secret=`），secret 會留在 access log | `api/cron/reminder/route.ts:59` |
| C13 | 工作目錄內有 `dev.db`、`talent-class-system-backup-*.json`（全庫含個資）、四個 .env 檔。雖已 gitignore，但躺在桌面資料夾且曾出現「`* 2`」複製檔（`page 2.tsx`、`.next 2`），顯示整個資料夾被複製同步過——複製品未必被 gitignore 保護 | repo 根目錄 |

## D. 低風險問題清單

| # | 問題 | 證據 |
|---|------|------|
| D1 | `POST /api/teachers`、多數 create/update 直接 spread `req.json()`（mass assignment 風味），靠 Prisma schema 擋，建議白名單化 | `api/teachers/route.ts:24` |
| D2 | 審計 log 寫入失敗只 `console.warn`，不會擋操作也不會告警（可接受，但敏感操作建議至少計數告警） | `src/lib/auditLog.ts` |
| D3 | `readAuditLogs` 用 `$queryRawUnsafe` 拼 SQL——參數有用 `?` 佔位，無注入，但 pattern 危險，後人易改壞 | `src/lib/auditLog.ts` |
| D4 | 前端仍有 `alert()/confirm()`（出勤、課程、園所頁），體驗與防呆強度不足 | `attendance/page.tsx:143,184` 等 |
| D5 | console 輸出僅 ~30 處且多為 console.error，無敏感資料外洩，唯 cron 有一處 console.log 統計 | grep 結果 |
| D6 | 全站幾乎用 `<img>` 而非 `next/image`，照片列表無 lazy loading | school-portal 除外 |
| D7 | `CourseScheduleException`（停課/補課）與 `Attendance.cancelled` 雙軌並存，同步關係無檢查 | schema L259-271 |

---

## E. 第一階段一定要修的項目（建議 1–2 週內）

1. **E1｜堵住老師個資外洩**：`/api/teacher-resumes/card/[teacherId]` 改為簽章 token 存取（比照 `/api/teacher-resumes/public/[token]`），或至少從回傳中剔除 phone/email。
2. **E2｜修 `fixedSemesterRange` 寫死日期**（B4）——8 月前必修。
3. **E3｜課程刪除改軟刪除**：`Course`/`Attendance` 加 `deletedAt`，DELETE API 改標記；有出勤紀錄的課禁止刪除（改停用）。
4. **E4｜停用共用密碼登入**：所有人改用個人帳號；`ADMIN_PASSWORD` 保留為緊急開關但預設關閉，並移除 dev 的 `admin123` fallback。
5. **E5｜薪資政策對齊**：決定「未回報是否計薪」，統一 `salaryCalculation.ts` 與 LINE 文案；同時把 `needsReview` 時數列成行政可見清單。
6. **E6｜請款漏帳偵測**：先跑一次性檢查找出 `schoolId IS NULL` 或名稱比對不到的活躍課程（B6），修資料 + 加規則（見 K-16）。
7. **E7｜效能止血三招**（詳見 H）：熱路徑 ALTER TABLE 加旗標、LINE 通知移到背景（`after()`/`waitUntil`）、`/api/teachers` 加 minimal 模式。

## F. 第二階段可以優化的項目（1–2 個月）

1. 把所有執行期建表/加欄位收進 prisma migration，刪除全部 `ensure*`（B7 根治，同時解效能與一致性）。
2. 建「異常管理中心」（見 I）與每日一致性檢查 cron（見 K）。
3. 薪資快照表 PayrollRun + 自動上鎖流程；請款單 stale 偵測。
4. NotificationLog 通知發送紀錄表 + 失敗重試。
5. middleware 深度防禦：所有寫入 API 補 `requireRole`；middleware 加「預設拒絕」測試。
6. 公開 token 縮短效期（回報 14 天足矣）、獨立 secret、加撤銷版本號。
7. 備份改存 Vercel Blob/S3（加密）+ 每季還原演練，取代 Gmail 附件。
8. 前端 `alert/confirm` 換成 Dialog、選項資料加 client cache、照片 lazy load。
9. 桌面資料夾清理：移除 `dev.db`、備份 JSON、`* 2` 複製檔，.env 收進密碼管理器。

## G. 資安優先修正清單（依序）

1. E1 老師個資公開端點（今天就能改）
2. E4 共用密碼登入
3. E3 硬刪除 → 軟刪除
4. C4 middleware 對停用帳號的即時失效（把 token 帶 `tokenVersion`，middleware 驗版本，或縮短 JWT 效期至 24h + refresh）
5. C12 cron secret 移出 querystring
6. C5 公開 token 分離 secret + 縮短效期
7. C2 `/api/teachers` 依角色裁剪欄位（staff/viewer 看不到電話與費率）
8. C11 備份通道改造
9. C1 全 route 補 `requireRole`（工程量大，排第二階段）
10. C13 本機檔案清理

---

## H. 速度效能優化清單

### 最可能造成慢的原因（依影響排序）

1. **執行期 DDL 在熱路徑**：全 codebase 40 處 `ensure*` 呼叫。最糟的 `ensureArrivalColumns()`（`attendanceArrival.ts:74-84`）**沒有快取旗標**，老師每次打卡多付 4 次無效 ALTER TABLE 往返；`schoolNotification.ts:40-46` 每次 3 次；`ensureSchoolInvoiceTables` cold start 後一次 17 條 DDL。Turso 每個查詢都是一次 HTTP 往返，這是全站「每頁慢一拍」的共通稅。
2. **課後回報送出的同步鏈**：`report/[id]/route.ts:370-372` 送出回報時同步 await 園所 LINE 通知，整條鏈 15+ 次循序 DB 往返 + 1 次 LINE API——老師按送出轉圈數秒的直接原因。
3. **`/api/teachers` 全量 + 90 天出勤掃描**：`teacherTeachingProfile.ts:143-157` 為了下拉選單把所有老師近 90 天出勤（含 join）全撈，出勤頁、課程頁每次載入都付這筆。
4. **代課詢問迴圈循序發 LINE**：`send-inquiries/route.ts:23-45`，10 位老師＝10 次 DB + 10 次 LINE API 循序。
5. **零快取**：所有 API no-store，course-options/老師名單/園所名單這類幾乎不變的資料每次全額重打。

### 最慢的頁面（推估 Top 4）

1. 課後回報送出（/report/[id] POST）
2. 出勤紀錄頁首載（DDL + /api/teachers 全量 + courses minimal 三支各自偏重）
3. 老師 LINE 打卡回覆延遲（DDL + `createMissing` N+1，`attendanceArrival.ts:188-201`）
4. 課程頁（/api/teachers 全量 + 月出勤 join）

（做得好的：`/api/dashboard`、`/api/salary` 都有 Promise.all + select 精簡；出勤 API 有分頁；照片存 Vercel Blob 且 client 端先壓縮。）

### 第一階段最該優化的 5 個地方

| # | 優化 | 檔案 | 做法 |
|---|------|------|------|
| H1 | LINE 通知移出同步路徑 | `api/report/[id]/route.ts:370-372`、`lib/schoolNotification.ts`、`api/teacher-leaves/[id]/send-inquiries/route.ts` | 用 Next `after()` 或 Vercel `waitUntil()` 背景執行；send-inquiries 改 `Promise.allSettled`。回報送出體感從數秒降到 <1 秒 |
| H2 | 清除熱路徑 runtime DDL | `lib/attendanceArrival.ts:74-84`、`lib/schoolNotification.ts:40-46` 等 | 短期：補 module-level ready 旗標（一行）；中期：全部收進 prisma migration |
| H3 | `/api/teachers` minimal 模式 + 快取 | `api/teachers/route.ts`、`attendance/page.tsx:109`、`courses/page.tsx:214` | `?minimal=1` 只回 id/name/isAssistant，跳過 90 天掃描；`Cache-Control: private, max-age=300` |
| H4 | 打卡/提醒 N+1 批次化 | `lib/attendanceArrival.ts:188-201` | `createMissing` 改 createMany；打卡只處理該老師當日課 |
| H5 | 選項類資料 client cache | `api/course-options`、`api/courses/route.ts:77`（移除 minimal 的 no-store）、`lib/clientApi.ts` | 加 300 秒 sessionStorage/記憶體快取 helper；`nextCode` 改 max() 不撈全部 code |

---

## I. 異常管理中心設計

### 定位

不新建大系統——現有的 cron（reminder、check-teacher-arrival-reminders、equipmentReminder）已是偵測雛形，缺的是：統一的「異常事件表」、嚴重程度分級、指派與關閉流程。建議新增一張 `SystemAlert` 表（透過正式 migration）：

```
SystemAlert: id, type, severity(P1/P2/P3), title, targetType, targetId,
             assigneeRole, status(open/acked/resolved/auto_resolved),
             dueAt, escalatedAt, resolvedAt, resolvedBy, resolveNote, createdAt
```

由每日/每小時 cron 跑檢查規則產生，`@@unique(type, targetType, targetId, open)` 防重複；條件消失時自動關閉（auto_resolved）。

### 異常規則表

| 異常 | 嚴重度 | 處理人 | 時限 | 升級主管條件 | 關閉方式 |
|------|--------|--------|------|--------------|----------|
| 明天有課但老師未確認（含「待安排」佔位老師） | P1 | 行政 | 4h | 開課前 12h 未解 | 老師確認/換人後自動關 |
| 明天有課、器材停在「待確認」或「無法協助」 | P1 | 行政 | 4h | 開課前 12h | 器材狀態變更自動關 |
| 明天有課但園所地址/資訊不完整 | P2 | 行政 | 24h | 開課前 12h | 補齊自動關 |
| 老師未到校打卡（課程已結束仍無 `teacherArrivedAt`，即現有 expired_missing） | P1 | 行政→主管 | 1h | 立即通知主管（現在只計數不動作） | 行政確認實況後手動關 |
| 下課後 48h 未回報（reportWindow 已逾期） | P2 | 老師→行政 | 24h | 逾 72h | 補回報自動關 |
| 請假已核准但尚未找到代課，開課 ≤48h | P1 | 行政 | 4h | ≤24h 未解 | 代課確認自動關 |
| 代課已確認但代課老師 LINE 按取消 | P1 | 行政 | 2h | 立即 | 行政重新指派後手動關 |
| 請假停在待審核且 leaveDate 將至/已過 | P2 | 主管 | 24h | 已過期 | 審核動作自動關 |
| 園所改時間/確認表異動但老師未確認 | P2 | 行政 | 24h | 開課前 24h | 老師確認自動關 |
| LINE 發送失敗（schoolNotifyStatus=通知失敗 + 未來的 NotificationLog） | P2 | 行政 | 8h | 同對象連續失敗 3 次 | 重送成功自動關 |
| 課程無負責老師/無 schoolId 連結 | P2 | 行政 | 48h | 一週未解 | 資料補齊自動關 |
| 老師簡歷不完整（status=未填寫）但已排課 | P3 | 行政催老師 | 7d | — | 簡歷提交自動關 |
| 老師 LINE 未綁定但 7 天內有課 | P2 | 行政 | 48h | 開課前 24h | 綁定自動關 |
| 薪資對不上：needsReview 時數、未回報卻計薪、結算月未上鎖 | P1 | 會計 | 發薪前 3d | 發薪前 1d | 會計確認後手動關 |
| 請款對不上：快照與現行出勤不一致、當月有出勤無請款單 | P1 | 會計 | 月結前 3d | 月結前 1d | 重開請款/確認後手動關 |
| 園所人數異動（確認表/出勤人數）但請款未同步 | P2 | 會計 | 72h | 月結前 | 確認後手動關 |

通知管道：P1 產生時即推 LINE 給處理人；逾時未 ack 升級推給主管；P2/P3 進每日晨間摘要（可掛在現有 reminder cron）。

---

## J. 操作歷程改善建議

### 現況（比預期好）

`src/lib/auditLog.ts` 欄位已含：操作人（id/名/角色）、動作、對象類型/ID/標籤、**beforeData/afterData**、diffSummary、IP、User-Agent、sensitive 標記，且有 secret 遮罩。登入成功/失敗、老師 CRUD、課程刪除、代課確認等都有寫。

### 缺口與建議

1. **覆蓋盤點**：以下操作需確認/補上 audit log——LINE 手動發送（`/api/line/push`、`/api/line/schedule`）、園所人數確認表修改（confirmation 有 History 表但建議同步寫 AuditLog）、請款單狀態變更與刪除、薪資調整 CRUD、出勤批次建立/去重（setup API）、portal link 重新產生。建議做法：grep 每支有寫入的 route，凡 `create/update/delete` 而無 `writeAuditLog` 者列表補齊。
2. **失敗不告警**：audit 寫入失敗只 console.warn（D2），敏感操作建議失敗時同步告警或重試。
3. **加欄位**：`requestId`（串同一請求的多筆）、`affectedCount`（批次操作影響筆數）、`source`（web/LINE/cron）——LINE webhook 觸發的變更目前 actor 資訊薄弱。
4. **保存政策**：AuditLog 無清理與匯出策略，建議至少保 2 年、每月冷備份。
5. **防竄改**：目前 owner 角色理論上可直接動 DB；若要「出事不羅生門」，可加每日 log hash 鏈或匯出到唯讀儲存。

## K. 資料一致性檢查建議

建議做一支每日 cron `/api/cron/consistency-check`，跑以下規則、結果寫入 SystemAlert（規則細節含查詢邏輯已驗證過 schema 可行）：

**代課/請假鏈**
1. 懸置代課單：`Substitute.confirmed=false AND date <= now()+3天`
2. 孤兒代課單：`Substitute.attendanceId IS NULL`（onDelete:SetNull 造成）
3. 代課與出勤不一致（防禦性）：`Substitute JOIN Attendance` 比對 actualTeacherId
4. 請假卡關：status 停在待審核/尋找代課中且 leaveDate 已過或 ≤2 天
5. 已確認代課後 inquiry 被取消（C7 場景）
6. 執行期表斷鏈：TeacherLeaveRequest/SubstituteInquiry LEFT JOIN 對象為 NULL

**出勤/薪資鏈**
7. 未回報逾期（reportWindow 邏輯 + date+48h < now）
8. 結算月出勤 `isPayrollLocked=false`
9. `resolvePayrollHours` needsReview 清單
10. 未回報卻會計薪的出勤（政策對齊前先列清單）
11. `SalaryAdjustment.isPaid=false AND payoutMonth < 當月`

**請款鏈**
12. 快照過期：`SchoolInvoiceDetail JOIN Attendance` 比對 studentCount/cancelled；attendanceId 指向已刪出勤
13. 漏開請款：每園所×月份，有出勤但無 SchoolInvoice
14. 園所斷鏈課程：`Course.isActive AND (schoolId IS NULL OR 名稱對不上 School)`（**先手動跑一次，這條直接影響收入**）
15. perPerson 課程當月出勤人數全 NULL
16. 已寄出逾 30 天未收款

**主檔/通知**
17. 活躍課程無地址（Course.address 與 School.address 皆空）
18. 近 30 天有課的老師：無 lineUserId / 無 phone
19. 有活躍課程的園所無 lineUserId
20. `schoolNotifyStatus='通知失敗'` 清單 + 一鍵重送
21. 當期 SchoolStartConfirmation 未提交
22. CourseScheduleException(停課) 對應 Attendance.cancelled=false（雙軌不同步）

## L. 老師手機端優化建議

現況（大多做得不錯）：老師入口是 LINE 而非網頁登入，資料隔離良好（token 只解出單筆、lineUserId 反查過濾，無 IDOR）；打卡 1 步；回報頁 max-w-md 單欄、大按鈕、sticky 送出、照片自動壓縮；請假是 LINE 對話式 3 步。

要改的：

1. **回報送出等太久**（=H1）：通知移背景後，30 秒內完成回報才成立。
2. **打卡回覆延遲**（=H2/H4）：清 DDL + 批次化。
3. 回報頁載入用 skeleton 取代純文字「載入表單中...」。
4. 出錯提示：目前後台仍有 `alert()`；老師端 LINE 失敗訊息應告訴老師「找誰、怎麼辦」而不只是失敗。
5. 打卡遲到目前只告知老師本人——行政端需要彙總（併入異常中心）。
6. 老師自助查詢：LINE 指令已可查課表，建議加「我的本月時數」查詢，減少問行政（薪資明細仍走 email，不進 LINE）。

---

## M. 給工程師看的修改清單（依優先序）

**第一階段（1–2 週，先做完再說）**

| # | 任務 | 檔案 | 說明 |
|---|------|------|------|
| M1 | teacher-card API 去識別化或改 token | `src/app/api/teacher-resumes/card/[teacherId]/route.ts`、`src/lib/teacherResume.ts`、`src/middleware.ts` | 回傳剔除 phone/email，或路徑改用 `signTeacherResumeToken` |
| M2 | 修學期日期寫死 | `src/lib/teacherLeaves.ts:188-193` | 改由設定或依日期推算學期 |
| M3 | 課程/出勤軟刪除 | `prisma/schema.prisma`、`src/app/api/courses/[id]/route.ts:239`、各 DELETE route | 加 `deletedAt`；有出勤的課只能停用 |
| M4 | 關閉共用密碼 + dev fallback | `src/app/api/auth/login/route.ts:47-56` | ADMIN_PASSWORD 未設即不啟用；移除 admin123 |
| M5 | 薪資×回報政策對齊 | `src/lib/salaryCalculation.ts:70-74`、`src/lib/line.ts:385,467,887` | 二選一並加 needsReview 清單輸出 |
| M6 | 一次性請款漏帳掃描 + 修資料 | `src/lib/schoolInvoices.ts:336-339` | 找出 schoolId 斷鏈課程 |
| M7 | ALTER TABLE 加 ready 旗標 | `src/lib/attendanceArrival.ts:74-84`、`src/lib/schoolNotification.ts:40-46` | 一行修，立即省往返 |
| M8 | LINE 通知移背景 | `src/app/api/report/[id]/route.ts:370-372`、`src/app/api/teacher-leaves/[id]/send-inquiries/route.ts:23-45` | `after()`/`waitUntil` + `Promise.allSettled` |
| M9 | `/api/teachers?minimal=1` | `src/app/api/teachers/route.ts`、`src/app/attendance/page.tsx:109`、`src/app/courses/page.tsx:214` | 跳過 90 天掃描 + cache header |
| M10 | cron secret 移出 querystring | `src/app/api/cron/reminder/route.ts:59` | 只收 Authorization header |

**第二階段（1–2 個月）**

| # | 任務 | 檔案 |
|---|------|------|
| M11 | 執行期建表全部收進 prisma migration，刪 `ensure*` | `prisma/schema.prisma`、`lib/teacherLeaves.ts`、`lib/teacherResume.ts`、`lib/schoolInvoices.ts`、`lib/attendanceArrival.ts` 等約 40 處 |
| M12 | SystemAlert 表 + consistency-check cron + 異常中心頁 | 新增 `src/app/api/cron/consistency-check/route.ts`、`src/app/alerts/page.tsx` |
| M13 | NotificationLog 通知紀錄表 + 失敗重送 | 新表 + `src/lib/line.ts:279-300` 落地失敗 |
| M14 | PayrollRun 薪資快照 + 自動鎖定 | 新表 + `src/lib/salaryCalculation.ts`、`api/salary/send` |
| M15 | 請款 stale 偵測 | `src/lib/schoolInvoices.ts`（用 Detail.attendanceId 比對） |
| M16 | 全 route 補 requireRole + 欄位級裁剪 | 約 60 支 route，優先寫入類與 `/api/teachers` |
| M17 | token 治理：獨立 secret、縮效期、版本撤銷 | `src/lib/publicAccessToken.ts`、`authSecret.ts` |
| M18 | 備份改 Blob 加密 + 還原演練 | `src/app/api/cron/backup/route.ts` |
| M19 | middleware 停用帳號即時失效（tokenVersion） | `src/middleware.ts`、`src/lib/auth.ts` |
| M20 | 前端：alert/confirm 換 Dialog、選項 cache、skeleton、img lazy | `lib/clientApi.ts`、各 page.tsx |
| M21 | confirm-substitute 合併為單一 transaction | `api/teacher-leaves/[id]/confirm-substitute/route.ts:37-57` |
| M22 | 代課 LINE 取消 → 通知行政 + 產生 P1 異常 | `src/lib/lineWebhook.ts:629-641` |

## N. 問題 ↔ 檔案對照

上表 B/C/D/H/M 各項均已附檔案路徑與行號，此處不重複；跨區索引：

- 個資外洩：`middleware.ts:10`、`api/teacher-resumes/card/[teacherId]/route.ts`、`lib/teacherResume.ts:91-96`
- 硬刪除：`api/courses/[id]/route.ts:239-240` + 15 支 DELETE route
- 認證：`api/auth/login/route.ts`、`lib/auth.ts`、`lib/authSecret.ts`、`middleware.ts`
- 效能熱點:`lib/attendanceArrival.ts`、`lib/schoolNotification.ts`、`lib/teacherTeachingProfile.ts:143-157`、`api/report/[id]/route.ts:370`
- 一致性：`lib/teacherLeaves.ts`、`lib/substituteAssignment.ts`、`lib/schoolInvoices.ts`、`lib/salaryCalculation.ts`、`lib/reportWindow.ts`
- 審計：`lib/auditLog.ts`、`lib/permissions.ts`

## O. 修正計畫與確認事項

**本次未修改任何程式。** 建議執行順序：第一階段 M1–M10（資安止血 + 效能止血 + 兩顆定時炸彈），驗收後再進第二階段 M11–M22（結構性根治）。

動手前請你先確認四個決策：

1. **未回報的課要不要計薪？**（M5 二選一）
2. **共用密碼登入可以關掉嗎？** 所有使用者都有個人帳號了嗎？（M4）
3. **課程刪除改為「有出勤就只能停用」可以接受嗎？**（M3）
4. **異常管理中心的通知對象**：P1 升級要推給哪位主管的 LINE？（M12 前需要）

確認後回覆要先做哪一批，我再開始改。
