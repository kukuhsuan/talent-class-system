import { createHmac, timingSafeEqual } from "node:crypto";
import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { prisma } from "@/lib/prisma";
import { requiredAuthSecret } from "@/lib/authSecret";

const issuer = "talent-class-system";
const audience = "backoffice";
const secret = () => new TextEncoder().encode(requiredAuthSecret());

// Bind sessions to the credential that was actually checked at login. A password
// reset changes this fingerprint immediately, without a production schema change.
// Never put a password or its database hash into a readable JWT payload.
function credentialVersion(subject: string, credential: string) {
  return createHmac("sha256", requiredAuthSecret())
    .update(JSON.stringify(["backoffice-credential-v1", subject, credential]))
    .digest("hex");
}

export function legacyLoginAllowed() {
  return process.env.NODE_ENV !== "production" || process.env.ALLOW_LEGACY_LOGIN === "1";
}

export async function signToken(payload: Record<string, unknown>, credential: string) {
  if (!credential) throw new Error("Missing login credential");
  const subject = payload.userId == null ? "legacy-admin" : String(payload.userId);
  return new SignJWT({ ...payload, credentialVersion: credentialVersion(subject, credential) })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(subject)
    .setIssuer(issuer)
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret());
}

export async function verifyToken(token: string): Promise<JWTPayload & { role: string; username: string; name: string }> {
  const { payload } = await jwtVerify(token, secret(), { issuer, audience, algorithms: ["HS256"] });
  let credential: string;
  let identity: { role: string; username: string; name: string };
  if (payload.sub === "legacy-admin" && payload.userId == null) {
    credential = legacyLoginAllowed() ? (process.env.ADMIN_PASSWORD?.trim() ?? "") : "";
    identity = { role: "admin", username: "legacy-admin", name: "系統管理員" };
  } else {
    const userId = Number(payload.userId);
    if (!Number.isSafeInteger(userId) || userId <= 0 || payload.sub !== String(userId)) throw new Error("Invalid session");
    // No cross-request cache: reset/disable must apply to reads as well as writes.
    const account = await prisma.userAccount.findUnique({
      where: { id: userId },
      select: { isActive: true, role: true, username: true, name: true, passwordHash: true },
    });
    if (!account?.isActive) throw new Error("Invalid session");
    credential = account.passwordHash;
    identity = { role: account.role, username: account.username, name: account.name };
  }
  if (!credential || typeof payload.credentialVersion !== "string") throw new Error("Invalid session");
  const expected = Buffer.from(credentialVersion(payload.sub!, credential));
  const actual = Buffer.from(payload.credentialVersion);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error("Session revoked");
  return { ...payload, ...identity };
}
