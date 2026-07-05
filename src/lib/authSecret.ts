const DEVELOPMENT_FALLBACK_SECRET = "talent-class-secret-change-in-prod";

export function requiredAuthSecret() {
  const secret = process.env.AUTH_SECRET?.trim();
  if (secret) return secret;

  if (process.env.NODE_ENV === "production") {
    throw new Error("AUTH_SECRET is required in production");
  }

  return DEVELOPMENT_FALLBACK_SECRET;
}
