import { NextResponse } from "next/server";

// 樂觀鎖：畫面載入時拿到 version，送出時原樣帶回來，
// 後端用 `WHERE id = ? AND version = ?` 更新。更新到 0 列就代表這段期間有別人改過。
//
// 為什麼不用資料庫交易或悲觀鎖：這裡的併發不是毫秒級的，是「行政早上開著編輯視窗
// 去開會，回來按儲存」這種以分鐘計的視窗。交易擋不到跨請求的覆蓋，鎖著一列不放
// 又會把整個後台卡住。真正該做的是在寫入當下發現資料已經變了，然後拒絕寫入。

export const VERSION_CONFLICT_MESSAGE = "這筆資料剛被其他人修改，請重新載入";

// 沒帶 version 的請求（舊分頁、外部腳本、還沒改的畫面）不強制擋，
// 直接擋掉會讓所有既有整合在上線當下全部壞掉。帶了就一定要驗。
//
// 回傳 undefined = 沒帶版本，略過檢查；null = 帶了但不是合法版本號。
// 這兩者一定要分開。把 "abc"、-1、NaN 一律當成「沒帶」的話，前端哪天把 version
// 傳歪了，樂觀鎖就整個靜默失效——畫面一切正常，沒有任何錯誤訊息，
// 要等到有人覆蓋掉別人的資料、而且被發現，才會知道這個機制其實沒在運作。
export function parseExpectedVersion(value: unknown): number | null | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const version = Number(value);
  return Number.isInteger(version) && version >= 0 ? version : null;
}

export function invalidVersionResponse() {
  return NextResponse.json({ error: "版本號格式不正確，請重新載入頁面後再儲存" }, { status: 400 });
}

// 把 version 併進 where。undefined 時回傳原本的條件，等同不檢查。
export function versionWhere<T extends Record<string, unknown>>(where: T, expected: number | undefined) {
  return expected === undefined ? where : { ...where, version: expected };
}

export function versionConflictResponse(detail?: string) {
  return NextResponse.json(
    { error: detail ? `${VERSION_CONFLICT_MESSAGE}（${detail}）` : VERSION_CONFLICT_MESSAGE, conflict: true },
    { status: 409 },
  );
}

// Prisma 的 update 找不到符合條件的列時丟 P2025。因為我們把 version 塞進 where，
// 這個錯誤在樂觀鎖情境下就是「版本已過期」，不是「資料不存在」——
// 呼叫端要在更新前自己確認過該列存在，才能這樣解讀。
export function isRecordNotFound(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === "P2025";
}
