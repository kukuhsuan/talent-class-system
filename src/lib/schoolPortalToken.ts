import { SignJWT, jwtVerify } from "jose";

const portalSecret = new TextEncoder().encode(
  process.env.AUTH_SECRET ?? "talent-class-secret-change-in-prod"
);

export async function signSchoolPortalToken(schoolId: number) {
  return signSchoolPortalTokenWithVersion(schoolId, 1);
}

export async function signSchoolPortalTokenWithVersion(schoolId: number, tokenVersion: number) {
  return new SignJWT({ type: "school-portal", schoolId, tokenVersion })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("90d")
    .sign(portalSecret);
}

export async function verifySchoolPortalToken(token: string) {
  const { payload } = await jwtVerify(token, portalSecret);
  if (
    payload.type !== "school-portal"
    || typeof payload.schoolId !== "number"
    || typeof payload.tokenVersion !== "number"
  ) {
    throw new Error("Invalid school portal token");
  }
  return { schoolId: payload.schoolId, tokenVersion: payload.tokenVersion };
}
