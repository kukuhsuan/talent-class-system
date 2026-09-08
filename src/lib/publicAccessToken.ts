import crypto from "node:crypto";
import { requiredAuthSecret } from "@/lib/authSecret";

type PublicTokenPayload = {
  type: "report" | "assessment" | "recruitment" | "teacher_resume" | "teacher_card" | "teacher_document";
  attendanceId: number;
  campaignId?: number;
  teacherId?: number;
  // 連結世代，目前只有 teacher_document 用；比對 Teacher.docLinkEpoch 做作廢
  epoch?: number;
  reportRole?: "lead" | "assistant";
  exp: number;
};

const encoder = new TextEncoder();

function secret() {
  return requiredAuthSecret();
}

export function signReportAccessToken(
  attendanceId: number,
  reportRole: "lead" | "assistant" = "lead",
  maxAgeDays = 90,
) {
  const payload: PublicTokenPayload = {
    type: "report",
    attendanceId,
    reportRole,
    exp: Math.floor(Date.now() / 1000) + maxAgeDays * 24 * 60 * 60,
  };
  const encodedPayload = base64url(JSON.stringify(payload));
  return `${encodedPayload}.${signPayload(encodedPayload)}`;
}

export function verifyReportAccessToken(token: string) {
  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) throw new Error("Invalid token");

  const expectedSignature = signPayload(encodedPayload);
  const actual = Buffer.from(signature);
  const expected = Buffer.from(expectedSignature);
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) {
    throw new Error("Invalid token");
  }

  const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as PublicTokenPayload;
  if (payload.type !== "report" || !Number.isFinite(payload.attendanceId)) throw new Error("Invalid token");
  if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) throw new Error("Expired token");
  return {
    attendanceId: Number(payload.attendanceId),
    // 舊連結沒有角色欄位，維持完整回報權限，避免已發出的主教連結失效。
    reportRole: payload.reportRole === "assistant" ? "assistant" as const : "lead" as const,
  };
}

function base64url(value: string | Buffer) {
  return Buffer.from(value).toString("base64url");
}

function signPayload(encodedPayload: string) {
  return crypto.createHmac("sha256", encoder.encode(secret())).update(encodedPayload).digest("base64url");
}

export function signPublicAccessToken(type: PublicTokenPayload["type"], attendanceId: number, maxAgeDays = 90) {
  const payload: PublicTokenPayload = {
    type,
    attendanceId,
    exp: Math.floor(Date.now() / 1000) + maxAgeDays * 24 * 60 * 60,
  };
  const encodedPayload = base64url(JSON.stringify(payload));
  return `${encodedPayload}.${signPayload(encodedPayload)}`;
}

export function verifyPublicAccessToken(token: string, expectedType: PublicTokenPayload["type"]) {
  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) throw new Error("Invalid token");

  const expectedSignature = signPayload(encodedPayload);
  const actual = Buffer.from(signature);
  const expected = Buffer.from(expectedSignature);
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) {
    throw new Error("Invalid token");
  }

  const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as PublicTokenPayload;
  if (payload.type !== expectedType || !Number.isFinite(payload.attendanceId)) throw new Error("Invalid token");
  if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) throw new Error("Expired token");
  return { attendanceId: payload.attendanceId };
}

export function signRecruitmentToken(campaignId: number, teacherId: number, maxAgeDays = 90) {
  const payload: PublicTokenPayload = {
    type: "recruitment",
    attendanceId: 0,
    campaignId,
    teacherId,
    exp: Math.floor(Date.now() / 1000) + maxAgeDays * 24 * 60 * 60,
  };
  const encodedPayload = base64url(JSON.stringify(payload));
  return `${encodedPayload}.${signPayload(encodedPayload)}`;
}

export function verifyRecruitmentToken(token: string) {
  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) throw new Error("Invalid token");

  const expectedSignature = signPayload(encodedPayload);
  const actual = Buffer.from(signature);
  const expected = Buffer.from(expectedSignature);
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) {
    throw new Error("Invalid token");
  }

  const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as PublicTokenPayload;
  if (payload.type !== "recruitment" || !Number.isFinite(payload.campaignId) || !Number.isFinite(payload.teacherId)) {
    throw new Error("Invalid token");
  }
  if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) throw new Error("Expired token");
  return { campaignId: Number(payload.campaignId), teacherId: Number(payload.teacherId) };
}

export function signTeacherResumeToken(teacherId: number, maxAgeDays = 180) {
  const payload: PublicTokenPayload = {
    type: "teacher_resume",
    attendanceId: 0,
    teacherId,
    exp: Math.floor(Date.now() / 1000) + maxAgeDays * 24 * 60 * 60,
  };
  const encodedPayload = base64url(JSON.stringify(payload));
  return `${encodedPayload}.${signPayload(encodedPayload)}`;
}

export function verifyTeacherResumeToken(token: string) {
  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) throw new Error("Invalid token");

  const expectedSignature = signPayload(encodedPayload);
  const actual = Buffer.from(signature);
  const expected = Buffer.from(expectedSignature);
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) {
    throw new Error("Invalid token");
  }

  const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as PublicTokenPayload;
  if (payload.type !== "teacher_resume" || !Number.isFinite(payload.teacherId)) {
    throw new Error("Invalid token");
  }
  if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) throw new Error("Expired token");
  return { teacherId: Number(payload.teacherId) };
}

/**
 * 「簡歷卡片」用的唯讀權杖，和 teacher_resume 刻意分開。
 *
 * teacher_resume 是**發給老師本人填履歷**的連結：
 * /api/teacher-resumes/public/[token] 的 GET 會回傳未遮罩的電話與 Email，
 * PUT 還可以直接覆寫整份履歷。那把鑰匙絕對不能發給園所。
 *
 * 卡片連結是要貼進 LINE 群組給園所看的，只需要「唯讀、且只限這一位老師」。
 * 所以另立 teacher_card：拿卡片連結去打填寫端點會被 verifyTeacherResumeToken 擋掉。
 * 效期也短一些（90 天），因為它散布得比填寫連結廣。
 */
export function signTeacherCardToken(teacherId: number, maxAgeDays = 90) {
  const payload: PublicTokenPayload = {
    type: "teacher_card",
    attendanceId: 0,
    teacherId,
    exp: Math.floor(Date.now() / 1000) + maxAgeDays * 24 * 60 * 60,
  };
  const encodedPayload = base64url(JSON.stringify(payload));
  return `${encodedPayload}.${signPayload(encodedPayload)}`;
}

export function verifyTeacherCardToken(token: string) {
  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) throw new Error("Invalid token");

  const expectedSignature = signPayload(encodedPayload);
  const actual = Buffer.from(signature);
  const expected = Buffer.from(expectedSignature);
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) {
    throw new Error("Invalid token");
  }

  const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as PublicTokenPayload;
  if (payload.type !== "teacher_card" || !Number.isFinite(payload.teacherId)) {
    throw new Error("Invalid token");
  }
  if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) throw new Error("Expired token");
  return { teacherId: Number(payload.teacherId) };
}

// 敏感文件（存摺／委任書）用獨立的 type，履歷連結不能拿來上傳存摺，反之亦然。
// 效期比履歷短：存摺是金融資料，連結外流的風險成本高很多。
// epoch 來自 Teacher.docLinkEpoch，行政按「作廢舊連結」時 +1，舊權杖立刻失效。
export function signTeacherDocumentToken(teacherId: number, epoch = 0, maxAgeDays = 30) {
  const payload: PublicTokenPayload = {
    type: "teacher_document",
    attendanceId: 0,
    teacherId,
    epoch: Number(epoch) || 0,
    exp: Math.floor(Date.now() / 1000) + maxAgeDays * 24 * 60 * 60,
  };
  const encodedPayload = base64url(JSON.stringify(payload));
  return `${encodedPayload}.${signPayload(encodedPayload)}`;
}

export function verifyTeacherDocumentToken(token: string) {
  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) throw new Error("Invalid token");

  const expectedSignature = signPayload(encodedPayload);
  const actual = Buffer.from(signature);
  const expected = Buffer.from(expectedSignature);
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) {
    throw new Error("Invalid token");
  }

  const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as PublicTokenPayload;
  if (payload.type !== "teacher_document" || !Number.isFinite(payload.teacherId)) {
    throw new Error("Invalid token");
  }
  if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) throw new Error("Expired token");
  // epoch 的比對要拿到 Teacher 資料才做得了，交給呼叫端；這裡只負責原樣帶出來。
  // 舊權杖沒有 epoch 欄位，視為第 0 代。
  return { teacherId: Number(payload.teacherId), epoch: Number(payload.epoch ?? 0) };
}
