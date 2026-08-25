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
const PUBLIC_PREFIX = ["/report/", "/assessment/", "/school-portal/", "/school-billing/", "/school-attendance-verification/", "/recruitment/", "/teacher-resume/", "/teacher-documents/", "/teacher-card/", "/course-briefing-ack/", "/images/", "/skill-cards/", "/api/auth", "/api/cron", "/api/report/", "/api/assessment/", "/api/school-portal/", "/api/school-billing/", "/api/school-attendance-verification/", "/api/recruitment/public/", "/api/teacher-resumes/public/", "/api/teacher-resumes/card/", "/api/teacher-documents/public/", "/api/course-briefing-ack/", "/rating/", "/api/rating/", "/notify-ack/", "/api/notify-ack/", "/lesson-plan/", "/api/lesson-plan/"];
// customer_service：客服角色，可用一般後台與通知功能；薪資/帳號管理/稽核仍被下方清單擋下
const BACKOFFICE_ROLES = new Set(["owner", "super_admin", "developer", "admin", "customer_service", "staff", "accountant", "viewer"]);
const OWNER_ROLES = new Set(["owner", "super_admin", "developer"]);
// 薪資計算供營運人員核對；唯讀帳號不開放。
const SALARY_ROLES = new Set(["owner", "super_admin", "developer", "admin", "accountant", "staff", "customer_service"]);
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
    // 系統設定會決定原檔什麼時候被刪、老師端看到什麼連結，只開放最高權限
    || path === "/admin/settings"
    || path.startsWith("/admin/settings/")
    || path === "/api/settings"
    || path.startsWith("/api/settings/")
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
    || path.startsWith("/api/school-invoices/")
    || path === "/api/school-attendance-verifications";
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

// 這支 middleware 掛在「除了 _next/static 以外的每一個請求」上，而它每次都回資料庫問一次
// 帳號狀態。開一個頁面實際上不只一個請求：HTML 本身、Next.js 對導覽列 5 條 Link 的預抓、
// 再加上頁面自己打的 3~4 支 API，等於一次點擊就有 8~10 次 Turso 來回，而且每一次都排在
// 真正的查詢前面（先問完權限才輪到頁面的資料）。系統變慢最大的一塊就在這裡。
//
// 快取 15 秒。停用帳號不再是「下一個請求就失效」，最慢會晚 15 秒——但只晚在唯讀瀏覽上：
// 下面所有寫入請求與薪資、請款、帳號管理、稽核紀錄這些路徑一律不吃快取，照樣每次問資料庫。
// 也就是說被停用的人最多還能多看 15 秒的列表，改不了任何東西、也碰不到錢的部分。
const ROLE_CACHE_TTL_MS = 15_000;
// 上限存在的理由：middleware 的執行環境會被重複使用，沒有上限的 Map 會隨著登入過的帳號
// 一直長大，最後把記憶體吃光而不是慢慢變慢。超過就整批丟掉，代價只是下一輪重問一次。
const ROLE_CACHE_MAX = 500;
const roleCache = new Map<number, { role: string; expiresAt: number }>();

async function fetchAccountRole(userId: number) {
  const account = await prisma.userAccount.findUnique({
    where: { id: userId },
    select: { isActive: true, role: true },
  });
  return account?.isActive ? account.role : "";
}

async function activeAccountRole(payload: Record<string, unknown>, allowCache: boolean) {
  const userId = Number(payload.userId);
  if (!Number.isInteger(userId) || userId <= 0) return String(payload.role ?? "");

  if (allowCache) {
    const cached = roleCache.get(userId);
    if (cached && cached.expiresAt > Date.now()) return cached.role;
  }

  const role = await fetchAccountRole(userId);
  if (roleCache.size >= ROLE_CACHE_MAX) roleCache.clear();
  roleCache.set(userId, { role, expiresAt: Date.now() + ROLE_CACHE_TTL_MS });
  return role;
}

// 哪些請求不准吃快取：任何會改到資料的動作，以及錢、帳號、稽核相關的頁面與 API。
// 這些正是「停用一個帳號之後最怕他還能做的事」，所以寧可每次多一次資料庫來回。
function roleCacheAllowed(req: NextRequest, path: string) {
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) return false;
  return !isOwnerOnlyPath(path) && !isSalaryPath(path) && !isInvoicePath(path) && !isMaintenancePath(path);
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
      // 登入頁的轉址判斷：判錯的後果只是多看一次登入頁，不是權限外洩，可以吃快取
      const role = await activeAccountRole(payload, true);
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
      const role = await activeAccountRole(payload, false);
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
    const role = await activeAccountRole(payload, roleCacheAllowed(req, path));
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
