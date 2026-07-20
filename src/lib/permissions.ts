import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const OWNER_ROLES = ["owner", "super_admin", "developer"] as const;
export const ADMIN_ROLES = ["owner", "super_admin", "developer", "admin"] as const;
export const BACKOFFICE_ROLES = ["owner", "super_admin", "developer", "admin", "customer_service", "staff", "accountant", "viewer"] as const;
export const SALARY_ROLES = ["owner", "super_admin", "developer", "admin", "accountant"] as const;
// 可發送 LINE 通知的角色：accountant/viewer 預設不可大量發送
export const NOTIFY_ROLES = ["owner", "super_admin", "developer", "admin", "customer_service", "staff"] as const;

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
  const userId = session.userId == null ? null : Number(session.userId);
  // 帳號被停用或角色被調整時，讓舊 token 立即失效（不用等 7 天過期）
  if (userId != null) {
    try {
      const account = await prisma.userAccount.findUnique({
        where: { id: userId },
        select: { isActive: true, role: true },
      });
      if (!account || !account.isActive) return null;
      return {
        userId,
        username: String(session.username ?? ""),
        name: String(session.name ?? session.username ?? ""),
        role: account.role,
      };
    } catch {
      // 資料表尚未建立時退回 token 內的資訊
    }
  }
  return {
    userId,
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

// Same-origin 檢查：寫入 API 需由本站頁面發出（CSRF 防護；同時支援自訂網域與 Vercel 網域）
export function sameOriginOk(req: NextRequest) {
  const origin = req.headers.get("origin") ?? "";
  if (!origin) return true; // 同源 fetch 可能不帶 origin（如 GET 轉導）；cookie SameSite 另有保護
  try {
    return new URL(origin).host === (req.headers.get("host") ?? "");
  } catch {
    return false;
  }
}

export function requestIp(req: NextRequest) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || req.headers.get("x-real-ip")
    || "";
}

