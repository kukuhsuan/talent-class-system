import { PrismaClient } from "@prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";

// 有樂觀鎖版本號的資料表。錢與排班相關的三張，也是最常被多人同時改的三張。
const VERSIONED_MODELS = ["Course", "Attendance", "SalaryAdjustment"] as const;
const VERSIONED_WRITES = ["update", "updateMany"] as const;

type WriteArgs = { data?: unknown } | undefined;
type WriteHook = { args: WriteArgs; query: (args: unknown) => Promise<unknown> };

function bumpVersion({ args, query }: WriteHook) {
  const data = args?.data;
  // 呼叫端自己指定 version 的情況（例如資料修復腳本要寫回特定值）就尊重它，不加工
  if (!data || typeof data !== "object" || Array.isArray(data) || "version" in data) {
    return query(args);
  }
  return query({ ...args, data: { ...(data as Record<string, unknown>), version: { increment: 1 } } });
}

// version 一定要在「每一條」寫入路徑上都 +1，不能只在有檢查版本的那幾支 API 加。
// 會撞在一起的正是不同入口：老師走 LINE webhook 回報、行政走後台表單、代課流程走 lib——
// 只有後台那條會 +1 的話，行政拿著回報前的版本號送出仍然驗得過，照樣蓋掉老師剛填的東西，
// 而且畫面上還會顯示「儲存成功」。放在 client extension 是為了不必逐一改幾十處呼叫，
// 也不必期待日後新增的寫入路徑會記得補。
//
// extension 攔不到 $executeRawUnsafe 的原生 UPDATE，這是刻意不補的：
// 那十幾處寫的都是表單不會覆蓋的旁支欄位（老師抵達時間、提醒已送、園所簽名、
// 課後交接、scheduledTime、hoursOverridden、expectedStudentCount），
// 而且其中好幾處就跑在同一個請求裡、緊接在已驗版本的 update 之後——
// 在那裡 +1 等於把剛回傳給前端的版本號當場作廢，使用者下一次儲存必定 409。
// 唯一會被表單蓋掉的 payrollHours（payrollHours.ts、summerCampImport.ts）
// 每次都跟 course.update 同一個請求，已經被那次 update 的 +1 保護到。
// 參數收 unknown：建構時 options 被轉成 never，推導出來的型別參數跟預設的 PrismaClient
// 對不起來，直接標 PrismaClient 會編不過。這層的型別本來就沒有實質保護作用。
function withVersionBump(client: unknown): PrismaClient {
  const query = Object.fromEntries(VERSIONED_MODELS.map((model) => [
    model[0].toLowerCase() + model.slice(1),
    Object.fromEntries(VERSIONED_WRITES.map((operation) => [operation, bumpVersion])),
  ]));
  return (client as { $extends: (args: unknown) => unknown }).$extends({ query }) as PrismaClient;
}

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

function createPrismaClient() {
  const url =
    process.env.TURSO_DATABASE_URL?.trim() ||
    `file:${process.cwd()}/dev.db`;
  const authToken = url.startsWith("file:")
    ? undefined
    : process.env.TURSO_AUTH_TOKEN?.trim() || undefined;
  const config = authToken ? { url, authToken } : { url };
  const adapter = new PrismaLibSql(config);
  return withVersionBump(new PrismaClient({ adapter } as never));
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
