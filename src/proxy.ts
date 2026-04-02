import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSessionCookie } from 'better-auth/cookies';
import { LOCALES, DEFAULT_LOCALE } from '@/lib/constants';
import type { Locale } from '@/lib/constants';

/**
 * Next.js 16 Proxy — runs before routes are rendered.
 *
 * Handles two concerns:
 * 1. Dashboard auth gating (session cookie check)
 * 2. Locale prefix detection + URL rewriting for i18n
 */

const PUBLIC_DASHBOARD_PATHS = [
  '/dashboard/login',
  '/dashboard/register',
  '/dashboard/forgot-password',
  '/dashboard/reset-password',
];

/** Non-default locale codes for prefix matching */
const NON_DEFAULT_LOCALE_SET: Set<string> = new Set(
  LOCALES.filter((l) => l !== DEFAULT_LOCALE)
);

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── Dashboard auth gating ──
  if (pathname.startsWith('/dashboard')) {
    if (PUBLIC_DASHBOARD_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
      return NextResponse.next();
    }

    const sessionCookie = getSessionCookie(request);
    if (!sessionCookie) {
      return NextResponse.redirect(new URL('/dashboard/login', request.url));
    }

    return NextResponse.next();
  }

  // ── Customer account auth gating ──
  if (pathname.startsWith('/account')) {
    const sessionCookie = getSessionCookie(request);
    if (!sessionCookie) {
      return NextResponse.redirect(new URL(`/login?callbackUrl=${encodeURIComponent(pathname)}`, request.url));
    }
  }

  // ── Locale prefix detection + rewrite ──
  // Check if first path segment is a non-default locale
  const segments = pathname.split('/');
  const firstSegment = segments[1]; // segments[0] is '' (leading slash)

  if (firstSegment && NON_DEFAULT_LOCALE_SET.has(firstSegment)) {
    const locale = firstSegment as Locale;
    // Strip the locale prefix: /de/blog/post → /blog/post
    const strippedPath = '/' + segments.slice(2).join('/') || '/';
    const url = request.nextUrl.clone();
    url.pathname = strippedPath;

    const response = NextResponse.rewrite(url);
    response.headers.set('x-locale', locale);
    return response;
  }

  // Default locale — no rewrite, set header for consistency
  const response = NextResponse.next();
  response.headers.set('x-locale', DEFAULT_LOCALE);
  return response;
}

export const config = {
  matcher: ['/((?!api|_next|uploads|favicon\\.ico|sitemap\\.xml|robots\\.txt).*)'],
};
