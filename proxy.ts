import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Next.js 16 "proxy" (formerly middleware). Optimistic check only:
 * it verifies that a session cookie *exists*; real validation (DB lookup,
 * role check) happens in features/auth/guard.ts inside layouts/actions.
 *
 * NOTE: constants are inlined (no imports from server-only modules).
 */
const SESSION_COOKIE_NAME = "younes_session";
const NEXT_PATH_HEADER = "x-next-path";

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const hasSessionCookie = Boolean(request.cookies.get(SESSION_COOKIE_NAME)?.value);

  if (!hasSessionCookie) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(NEXT_PATH_HEADER, `${pathname}${search}`);
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ["/admin/:path*", "/account/:path*"],
};
