import { SignJWT, jwtVerify } from "jose";

const portalSecret = new TextEncoder().encode(
  process.env.AUTH_SECRET ?? "talent-class-secret-change-in-prod"
);

export async function signSchoolPortalToken(schoolId: number) {
  return new SignJWT({ type: "school-portal", schoolId })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("365d")
    .sign(portalSecret);
}

export async function verifySchoolPortalToken(token: string) {
  const { payload } = await jwtVerify(token, portalSecret);
  if (payload.type !== "school-portal" || typeof payload.schoolId !== "number") {
    throw new Error("Invalid school portal token");
  }
  return { schoolId: payload.schoolId };
}
