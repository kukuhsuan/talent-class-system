# 2026-10-22 安全修補

本機修補已完成，並於 2026-10-23 部署至正式 Vercel 專案。未執行既有資料遷移或 Blob 變更。

## 已修復

- Next.js 16.4.2、React/React DOM 19.2.9、sharp 0.35.5、Nodemailer 10.2.1、Prisma 7.10.1；更新相容間接依賴。ExcelJS 保持 4.4.0，僅覆寫其 uuid 為已修補的 11.x，已驗證含註解的 XLSX 往返讀寫。
- 課程照片只允許 private put，沒有 public fallback；只接受可解碼的 JPEG/PNG/WebP，轉成 JPEG 並移除原始 metadata。圖片讀取檢查精確歸屬、no-store、限制內容的 CSP。
- 主回報不再接受新增公開圖片連結；前端移除公開連結輸入。舊表單欄位會被忽略，不會把已刪的照片重新加入。
- 助教 token 無法 POST／DELETE 課程照片；主教仍可操作。
- 刪除課程照片時先呼叫 Blob del，成功後才移除資料庫連結。儲存端失敗則保留連結、回傳失敗，允許重試。此修補未新增自動重試排程。公開舊桶與私有桶使用各自 token；不允許刪除外部網站或其他類型的 Blob 檔案。
- 園所未設定或已停用驗證時回 403，取消僅靠分享連結的過渡豁免。已啟用但尚未登入時仍回 401 並呈現輸入驗證碼畫面。
- 重新產生園所碼／停用時遞增 sessionVersion，舊裝置不會在重新啟用後恢復有效；發 cookie 前也核對驗證時的版本，避免中途換碼仍發有效 cookie。
- 後台 JWT 加入 issuer/audience 及以 HMAC 產生的密碼憑證指紋。指紋綁定登入時已驗證的 passwordHash，不在 JWT 放明碼或密碼雜湊。每次驗證查詢目前帳號狀態及密碼指紋，重設密碼立即使舊 cookie 失效；資料庫失敗時拒絕登入狀態，不退回 token 角色。
- 既有明確啟用的 legacy 共用登入保留相容，但必須重新取得新格式 token，並核對目前設定的共用密碼指紋。個人帳號停用後重新啟用，若要永久撤銷停用前的 cookie，請同時重設密碼。

## 上線時的實際需求

1. 確認 `REPORT_PHOTO_READ_WRITE_TOKEN` 指向 **private Blob store**。未設定時程式沿用一般 Blob token，但若該桶為 public，上傳會安全地失敗，不會改為公開。若原本已有私有課程照片，新變數應指向原私有桶，避免讀不到舊資料。
2. 若以前的課程照片存在公開桶，保留原 `BLOB_READ_WRITE_TOKEN` 供刪除舊物件；不要把公開桶 token 覆蓋成新私有桶 token。
3. **舊公開照片不會因程式更新而自動變私有。** 必須在受控維護流程盤點 reportPhotos，將舊照片複製至私有桶、驗證讀取、更新所屬課程紀錄，再刪除公開原件。須另行核對舊通知、備份及其他欄位引用；手動貼入的外站圖片需原網站管理者處理。本次未遷移或刪除既有資料。
4. 為尚未設定驗證碼的園所完成啟用並交付驗證碼；未啟用的園所部署後會被阻擋。重新產生碼會登出該園所所有裝置。
5. 更新後所有後台舊 cookie 會失效，使用者須重新登入。採用密碼憑證指紋，不需新增正式資料庫欄位。
6. 透過既有發布流程部署新程式及 lockfile，再用測試帳號確認登入、園所讀取、照片上傳／刪除、既有照片顯示及角色限制。不要將本機驗證用密鑰部署到正式環境。

## 驗證結果

- `npm audit --omit=dev --json --ignore-scripts`：0 個已知漏洞；結果在 `output/security-review-2026-10-22/npm-audit-after.json`。這不是整個系統無漏洞的保證。
- 完整依賴掃描尚有 5 個 high 套件項目，均來自 ESLint → fast-glob → micromatch → braces 的同一開發工具相依鏈；官方 audit 只提出降級 eslint-config-next 至 14 的破壞性建議，因此未採用。沒有把這些項目宣稱已修好。
- `node scripts/security-regressions.test.cjs`：登入撤銷／proxy、園所啟用停用／換碼／跨園所、主教助教照片權限、私有上傳失敗／偽裝圖片／刪除重試／舊桶憑證、ExcelJS 測試通過。
- `node scripts/report-maintenance.test.cjs`、`node scripts/homework.test.cjs`（15 項）、`node scripts/homework-api.test.cjs`（2 項）：通過。
- `tsc --noEmit --incremental false`：通過。
- 修改的核心安全檔 ESLint 通過；回報 UI／主回報路由另有 5 個既有警告，沒有 lint error。
- `next build --webpack`：正式建置通過。預設 Turbopack 在此執行環境因內部開埠遭 OS 拒絕，改用 Webpack 完成驗證，未改動專案預設 build 命令。
- 驗證使用合成憑證、mock 服務及隔離本機資料庫，沒有向 LINE／郵件發送訊息。

## 建置相容性調整

新版 Next.js 的路由參數型別要求 Promise，14 個既有 route 的 Params 型別已調整，原本程式已有 await params，業務邏輯不變。

`tsconfig.json` 排除獨立的 `public/number-detective` 與未被主系統引用、尚缺 import 的 `src/lib/schoolInvoices.fix.ts` 草稿。兩者均保留原檔，未關閉主系統的型別檢查；若將草稿整合進產品，仍需補齊依賴與型別後移除排除項。

原始檢查報告與 verify.cjs 是修補前的重現快照，預期現在不再通過舊的「漏洞仍存在」斷言。修補後請執行 `scripts/security-regressions.test.cjs`。

## 正式部署（2026-10-23）

- Deployment：`dpl_27bWaW4zbyrLdeuHSc1HN9XJy5jv`，狀態 Ready。
- 正式網址：https://talent-class-system.vercel.app
- 部署紀錄：https://vercel.com/kus-projects-b9aa1172/talent-class-system/27bWaW4zbyrLdeuHSc1HN9XJy5jv
- 雲端使用既有 npm run build／Turbopack，建置成功；正式別名已指向新部署。
- 沿用現有正式環境變數與老師回報維護設定，沒有修改正式資料。REPORT_PHOTO_READ_WRITE_TOKEN 尚未配置；若沿用的 Blob 桶為 public，新版照片上傳將拒絕降級。
- .vercelignore 排除環境檔、資料庫／金鑰檔、本機報告／草稿與未被主系統引用的 public/number-detective。
- 線上匿名驗證通過：/login 200、首頁轉址 /login、teachers／salary／auth/me／cron API 均回 401。未以真實帳號測試寫入、發通知或照片上傳。
