import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const secret = new TextEncoder().encode(
  process.env.AUTH_SECRET ?? "talent-class-secret-change-in-prod"
);

const PUBLIC = ["/login", "/api/auth", "/api/line", "/api/cron", "/api/setup"];

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const token = req.cookies.get("auth-token")?.value;

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

  if (!token) return NextResponse.redirect(new URL("/login", req.url));

  try {
    await jwtVerify(token, secret);
    return NextResponse.next();
  } catch {
    return NextResponse.redirect(new URL("/login", req.url));
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
