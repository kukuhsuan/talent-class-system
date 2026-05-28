import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const secret = new TextEncoder().encode(
  process.env.AUTH_SECRET ?? "talent-class-secret-change-in-prod"
);

const PUBLIC_EXACT = ["/login", "/api/setup"];
const PUBLIC_PREFIX = ["/report/", "/assessment/", "/school-portal/", "/api/auth", "/api/line", "/api/cron", "/api/report/", "/api/assessment/", "/api/school-portal/"];
const ADMIN_ROLES = new Set(["admin", "developer"]);

function isPublicPath(path: string) {
  return PUBLIC_EXACT.includes(path) || PUBLIC_PREFIX.some((prefix) => path.startsWith(prefix));
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

  if (isPublicPath(path)) return NextResponse.next();

  if (!token) return unauthorized();

  try {
    const { payload } = await jwtVerify(token, secret);
    if (!ADMIN_ROLES.has(String(payload.role ?? ""))) {
      if (path.startsWith("/api/")) {
        return NextResponse.json({ error: "權限不足" }, { status: 403 });
      }
      return NextResponse.redirect(new URL("/login", req.url));
    }
    return NextResponse.next();
  } catch {
    return unauthorized();
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
