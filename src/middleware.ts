import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  if (pathname === "/login" || pathname.startsWith("/_next") || pathname.includes(".")) {
    return NextResponse.next();
  }
  const ownerId = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (!ownerId) return NextResponse.redirect(new URL("/login", request.url));
  return NextResponse.next();
}

export const config = { matcher: ["/((?!api).*)"] };
