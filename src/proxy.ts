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
export function proxy(request: NextRequest) {
  const sessionCookie = getSessionCookie(request);

  if (!sessionCookie) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
}

export const proxyConfig = {
  matcher: ['/dashboard/:path*'],
};
