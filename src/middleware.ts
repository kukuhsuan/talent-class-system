import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { requiredAuthSecret } from "@/lib/authSecret";

const secret = new TextEncoder().encode(
  requiredAuthSecret()
);

const PUBLIC_EXACT = ["/login", "/api/setup", "/api/line/north", "/api/line/south", "/api/line/school", "/api/line/school2"];
const PUBLIC_PREFIX = ["/report/", "/assessment/", "/school-portal/", "/recruitment/", "/teacher-resume/", "/teacher-card/", "/images/", "/skill-cards/", "/api/auth", "/api/cron", "/api/report/", "/api/assessment/", "/api/school-portal/", "/api/recruitment/public/", "/api/teacher-resumes/public/", "/api/teacher-resumes/card/"];
const BACKOFFICE_ROLES = new Set(["owner", "super_admin", "developer", "admin", "staff", "accountant", "viewer"]);
const OWNER_ROLES = new Set(["owner", "super_admin", "developer"]);
const SALARY_ROLES = new Set(["owner", "super_admin", "developer", "admin", "accountant"]);

function isPublicPath(path: string) {
  return PUBLIC_EXACT.includes(path) || PUBLIC_PREFIX.some((prefix) => path.startsWith(prefix));
}

function isMaintenancePath(path: string) {
  return path === "/api/setup" || path.startsWith("/api/setup/") || path === "/api/admin/migrate" || path === "/api/seed";
}

function isOwnerOnlyPath(path: string) {
  return path === "/admin/users"
    || path.startsWith("/admin/users/")
    || path === "/admin/audit-logs"
    || path.startsWith("/admin/audit-logs/")
    || path === "/api/admin/audit-logs"
    || path === "/alerts"
    || path.startsWith("/alerts/")
    || path === "/api/alerts"
    || path.startsWith("/api/alerts/");
}

function isSalaryPath(path: string) {
  return path === "/salary"
    || path.startsWith("/salary/")
    || path === "/api/salary"
    || path.startsWith("/api/salary/")
    || path === "/api/salary-adjustments"
    || path.startsWith("/api/salary-adjustments/")
    || path === "/api/export/salary";
}

function maintenanceSecret(req: NextRequest) {
  return req.headers.get("x-maintenance-secret")?.trim()
    || req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim()
    || "";
}

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const token = req.cookies.get("auth-token")?.value;
  const unauthorized = () => {
    if (path.startsWith("/api/")) {
      return NextResponse.json(
        { error: "登入狀態已失效，請重新登入後再試" },
        { status: 401 },
      );
    }
    return NextResponse.redirect(new URL("/login", req.url));
  };

  if (path.startsWith("/login")) {
    if (!token) return NextResponse.next();
    try {
      await jwtVerify(token, secret);
      return NextResponse.redirect(new URL("/", req.url));
    } catch {
      return NextResponse.next();
    }
  }

  if (process.env.NODE_ENV === "production" && isMaintenancePath(path)) {
    const expectedSecret = process.env.MAINTENANCE_SECRET?.trim() ?? "";
    if (!expectedSecret || maintenanceSecret(req) !== expectedSecret) {
      return NextResponse.json({ error: "Maintenance access denied" }, { status: 403 });
    }
    if (!token) return unauthorized();
    try {
      const { payload } = await jwtVerify(token, secret);
      if (!OWNER_ROLES.has(String(payload.role ?? ""))) {
        return NextResponse.json({ error: "權限不足" }, { status: 403 });
      }
    } catch {
      return unauthorized();
    }
  }

  if (isPublicPath(path)) return NextResponse.next();

  if (!token) return unauthorized();

  try {
    const { payload } = await jwtVerify(token, secret);
    const role = String(payload.role ?? "");
    if (!BACKOFFICE_ROLES.has(role)) {
      if (path.startsWith("/api/")) {
        return NextResponse.json({ error: "權限不足" }, { status: 403 });
      }
      return NextResponse.redirect(new URL("/login", req.url));
    }
    if (isOwnerOnlyPath(path) && !OWNER_ROLES.has(role)) {
      if (path.startsWith("/api/")) return NextResponse.json({ error: "權限不足" }, { status: 403 });
      return NextResponse.redirect(new URL("/", req.url));
    }
    if (isSalaryPath(path) && !SALARY_ROLES.has(role)) {
      if (path.startsWith("/api/")) return NextResponse.json({ error: "權限不足" }, { status: 403 });
      return NextResponse.redirect(new URL("/", req.url));
    }
    // viewer 為唯讀角色：只允許讀取類請求，禁止任何寫入 API
    if (role === "viewer" && path.startsWith("/api/") && !["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      return NextResponse.json({ error: "唯讀帳號無法執行此操作" }, { status: 403 });
    }
    return NextResponse.next();
  } catch {
    return unauthorized();
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
