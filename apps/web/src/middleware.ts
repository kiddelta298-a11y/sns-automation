import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";

const SESSION_SECRET = process.env.SESSION_SECRET ?? "default-secret-change-in-production";
const COOKIE_NAME = "sns_session";
const LOGIN_PATH = "/login";

function verifyToken(token: string): boolean {
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [b64, sig] = parts;
  try {
    const payload = Buffer.from(b64, "base64").toString();
    const expected = createHmac("sha256", SESSION_SECRET).update(payload).digest("hex");
    return timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow login page and API auth routes
  if (
    pathname === LOGIN_PATH ||
    pathname.startsWith("/api/auth/") ||
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/favicon")
  ) {
    return NextResponse.next();
  }

  const token = request.cookies.get(COOKIE_NAME)?.value;

  if (!token || !verifyToken(token)) {
    const loginUrl = new URL(LOGIN_PATH, request.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
