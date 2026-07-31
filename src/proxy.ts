import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { requiredAuthSecret } from "@/lib/authSecret";
import { prisma } from "@/lib/prisma";

const secret = new TextEncoder().encode(
  requiredAuthSecret()
);

const PUBLIC_EXACT = [
  "/login",
  "/api/setup",
  "/api/line/north",
  "/api/line/south",
  "/api/line/school",
  "/api/line/school2",
  // 園所分享頁與 PWA 在未登入狀態也必須能取得這些公開靜態資源。
  "/sw.js",
  "/offline.html",
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
  "/apple-touch-icon.png",
  "/upbear-logo.png",
  "/upbear-logo-sm.png",
  "/sports-leader-logo.png",
  "/sports-leader-icon-192.png",
  "/sports-leader-icon-512.png",
  "/sports-monitor-logo.png",
];
const PUBLIC_PREFIX = ["/report/", "/assessment/", "/school-portal/", "/school-billing/", "/recruitment/", "/teacher-resume/", "/teacher-documents/", "/teacher-card/", "/course-briefing-ack/", "/images/", "/skill-cards/", "/api/auth", "/api/cron", "/api/report/", "/api/assessment/", "/api/school-portal/", "/api/school-billing/", "/api/recruitment/public/", "/api/teacher-resumes/public/", "/api/teacher-resumes/card/", "/api/teacher-documents/public/", "/api/course-briefing-ack/", "/rating/", "/api/rating/", "/notify-ack/", "/api/notify-ack/"];
// customer_service：客服角色，可用一般後台與通知功能；薪資/帳號管理/稽核仍被下方清單擋下
const BACKOFFICE_ROLES = new Set(["owner", "super_admin", "developer", "admin", "customer_service", "staff", "accountant", "viewer"]);
const OWNER_ROLES = new Set(["owner", "super_admin", "developer"]);
const SALARY_ROLES = new Set(["owner", "super_admin", "developer", "admin", "accountant", "staff"]);
// 園所請款資料只開放會計；最高權限保留維運與緊急處理能力。
const INVOICE_ROLES = new Set(["owner", "super_admin", "developer", "accountant"]);

function isPublicPath(path: string) {
  return PUBLIC_EXACT.includes(path) || PUBLIC_PREFIX.some((prefix) => path.startsWith(prefix));
}

function isMaintenancePath(path: string) {
  return path === "/api/setup" || path.startsWith("/api/setup/") || path === "/api/admin/migrate" || path === "/api/seed";
}

function isOwnerOnlyPath(path: string) {
  return path === "/users"
    || path.startsWith("/users/")
    || path === "/api/users"
    || path.startsWith("/api/users/")
    || path === "/admin/users"
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
  return path === "/accounting"
    || path.startsWith("/accounting/")
    || path === "/api/accounting-month-end"
    || path.startsWith("/api/accounting-month-end/")
    || path === "/salary"
    || path.startsWith("/salary/")
    || path === "/api/salary"
    || path.startsWith("/api/salary/")
    || path === "/api/salary-adjustments"
    || path.startsWith("/api/salary-adjustments/")
    || path === "/api/export/salary";
}

function isInvoicePath(path: string) {
  return path === "/accounting"
    || path.startsWith("/accounting/")
    || path === "/api/accounting-month-end"
    || path.startsWith("/api/accounting-month-end/")
    || path === "/school-invoices"
    || path.startsWith("/school-invoices/")
    || path === "/api/school-invoices"
    || path.startsWith("/api/school-invoices/");
}

function maintenanceSecret(req: NextRequest) {
  return req.headers.get("x-maintenance-secret")?.trim()
    || req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim()
    || "";
}

function mutationOriginOk(req: NextRequest) {
  if (!pathIsWriteApi(req)) return true;
  const fetchSite = req.headers.get("sec-fetch-site");
  if (fetchSite === "cross-site") return false;
  const origin = req.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === (req.headers.get("host") ?? "");
  } catch {
    return false;
  }
}

function pathIsWriteApi(req: NextRequest) {
  return req.nextUrl.pathname.startsWith("/api/")
    && !["GET", "HEAD", "OPTIONS"].includes(req.method);
}

async function activeAccountRole(payload: Record<string, unknown>) {
  const userId = Number(payload.userId);
  if (!Number.isInteger(userId) || userId <= 0) return String(payload.role ?? "");
  const account = await prisma.userAccount.findUnique({
    where: { id: userId },
    select: { isActive: true, role: true },
  });
  return account?.isActive ? account.role : "";
}

export async function proxy(req: NextRequest) {
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
      const { payload } = await jwtVerify(token, secret);
      const role = await activeAccountRole(payload);
      if (BACKOFFICE_ROLES.has(role)) {
        return NextResponse.redirect(new URL("/", req.url));
      }
      const response = NextResponse.next();
      response.cookies.delete("auth-token");
      return response;
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
      const role = await activeAccountRole(payload);
      if (!OWNER_ROLES.has(role)) {
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
    const role = await activeAccountRole(payload);
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
    if (isInvoicePath(path) && !INVOICE_ROLES.has(role)) {
      if (path.startsWith("/api/")) return NextResponse.json({ error: "園所請款單僅限會計人員使用" }, { status: 403 });
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
    if (!mutationOriginOk(req)) {
      return NextResponse.json({ error: "拒絕跨網站操作" }, { status: 403 });
    }
    return NextResponse.next();
  } catch {
    return unauthorized();
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
