import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const secret = new TextEncoder().encode(
  process.env.AUTH_SECRET ?? "talent-class-secret-change-in-prod"
);

const PUBLIC = ["/login", "/report", "/assessment/", "/api/auth", "/api/line", "/api/cron", "/api/setup", "/api/report", "/api/assessment/"];

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

  if (PUBLIC.some((p) => path.startsWith(p))) return NextResponse.next();

  if (!token) return unauthorized();

  try {
    await jwtVerify(token, secret);
    return NextResponse.next();
  } catch {
    return unauthorized();
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
