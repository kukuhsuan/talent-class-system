import crypto from "node:crypto";

type PublicTokenPayload = {
  type: "report" | "assessment";
  attendanceId: number;
  exp: number;
};

const encoder = new TextEncoder();

function secret() {
  return process.env.AUTH_SECRET ?? "talent-class-secret-change-in-prod";
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
