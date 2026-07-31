import crypto from "node:crypto";
import { requiredAuthSecret } from "@/lib/authSecret";

type PublicTokenPayload = {
  type: "report" | "assessment" | "recruitment" | "teacher_resume" | "teacher_document";
  attendanceId: number;
  campaignId?: number;
  teacherId?: number;
  exp: number;
};

const encoder = new TextEncoder();

function secret() {
  return requiredAuthSecret();
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

// 敏感文件（存摺／委任書）用獨立的 type，履歷連結不能拿來上傳存摺，反之亦然。
// 效期比履歷短：存摺是金融資料，連結外流的風險成本高很多。
export function signTeacherDocumentToken(teacherId: number, maxAgeDays = 30) {
  const payload: PublicTokenPayload = {
    type: "teacher_document",
    attendanceId: 0,
    teacherId,
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
  return { teacherId: Number(payload.teacherId) };
}
