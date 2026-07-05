import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

export const OWNER_ROLES = ["owner", "super_admin", "developer"] as const;
export const ADMIN_ROLES = ["owner", "super_admin", "developer", "admin"] as const;
export const BACKOFFICE_ROLES = ["owner", "super_admin", "developer", "admin", "staff", "accountant", "viewer"] as const;
export const SALARY_ROLES = ["owner", "super_admin", "developer", "admin", "accountant"] as const;

export type AppRole = (typeof BACKOFFICE_ROLES)[number];

export function hasRole(role: unknown, allowed: readonly string[]) {
  return allowed.includes(String(role ?? ""));
}

export function isOwnerRole(role: unknown) {
  return hasRole(role, OWNER_ROLES);
}

export async function currentSessionUser() {
  const session = await getSession();
  if (!session) return null;
  return {
    userId: session.userId == null ? null : Number(session.userId),
    username: String(session.username ?? ""),
    name: String(session.name ?? session.username ?? ""),
    role: String(session.role ?? ""),
  };
}

export async function requireRole(allowed: readonly string[]) {
  const user = await currentSessionUser();
  if (!user) return { user: null, response: NextResponse.json({ error: "登入狀態已失效，請重新登入後再試" }, { status: 401 }) };
  if (!hasRole(user.role, allowed)) return { user, response: NextResponse.json({ error: "權限不足" }, { status: 403 }) };
  return { user, response: null };
}

export function requestIp(req: NextRequest) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || req.headers.get("x-real-ip")
    || "";
}

