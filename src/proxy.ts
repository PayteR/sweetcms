import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSessionCookie } from 'better-auth/cookies';

/**
 * Next.js 16 Proxy — runs before routes are rendered.
 *
 * Only checks for session cookie existence (fast, no HTTP call).
 * Actual session validation + banned/role checks happen server-side
 * in tRPC procedures via auth.api.getSession().
 */

const PUBLIC_DASHBOARD_PATHS = [
  '/dashboard/login',
  '/dashboard/register',
  '/dashboard/forgot-password',
  '/dashboard/reset-password',
];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow dashboard auth pages without session
  if (PUBLIC_DASHBOARD_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
    return NextResponse.next();
  }

  const sessionCookie = getSessionCookie(request);

  if (!sessionCookie) {
    return NextResponse.redirect(new URL('/dashboard/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*'],
};
