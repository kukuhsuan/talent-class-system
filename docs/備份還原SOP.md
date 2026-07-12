# 備份與還原 SOP

## 備份機制（現況）

- 每日 02:00（vercel.json cron）→ `/api/cron/backup` → 全部資料表匯出為 JSON → gzip → 寄到 `BACKUP_EMAIL`（Gmail）。
- backupVersion 2 起包含：Prisma 主表（園所、老師、課程、出勤、代課、進度、選項、評量、帳號〔不含密碼雜湊〕）＋ **所有其他資料表自動匯出**（請假、代課詢問、請款三表、異常中心、審核歷程、LINE 發送紀錄、器材、課程異動、簡歷、招募等，`data.rawTables`）。
- 之後新增的資料表會自動納入，不需改備份程式。

## 保留原則

- Gmail 至少保留最近 30 天備份信。
- 每月 1 日手動下載一份存到本地/雲端硬碟（雙份異地）。

## 還原步驟

前置：本機 clone 專案、`npm install`、能連 Turso（`turso` CLI 已登入）。

1. **下載備份**：從 Gmail 下載 `talent-class-system-backup-YYYY-MM-DD_HHMMSS.json.gz`，`gunzip` 解開。
2. **先在測試庫演練**：`turso db create talent-restore-test`，把 `.env` 的 `TURSO_DATABASE_URL`/`TURSO_AUTH_TOKEN` 指向測試庫。
3. **建表**：`npx prisma db push`（建 Prisma 表）；raw SQL 表在 App 首次呼叫時會自動 ensure，或直接進第 4 步用 INSERT 前先跑一次 `/api/setup/stability-migration` 與 `/api/cron/course-change-migration`。
4. **灌資料**：寫一次性 script（Node）讀 JSON：
   - `data.schools` → `prisma.school.createMany` …依序：schools → teachers → courses → attendances → substitutes → 其餘。
   - `data.rawTables` 的每張表 → 逐表 `INSERT INTO "表名" (欄位…) VALUES …`（欄位名即 JSON key）。
   - 注意順序：先主表後關聯表（School/Teacher → Course → Attendance → 其他）。
5. **帳號密碼**：備份不含 passwordHash（資安考量）。還原後用 `/api/setup` 重建管理帳號，或請使用者重設密碼。
6. **驗證**：登入後台核對園所/老師/課程/出勤筆數與備份信中的 counts 一致；抽查一筆請假、一張請款單。
7. **切正式**：確認無誤後，把正式環境的 Turso 指向還原後的庫（或反向把資料灌回正式庫），Vercel redeploy。

## 演練要求

- 上線前實際演練一次（步驟 1–6，用測試庫），記錄耗時。
- 之後每季演練一次。

## 環境變數備忘

備份相關：`CRON_SECRET`、`GMAIL_USER`、`GMAIL_APP_PASSWORD`、`BACKUP_EMAIL`（未設則寄到 GMAIL_USER）。
