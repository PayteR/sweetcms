'use client';

import { useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { useSession } from '@/lib/auth-client';
import { trpc } from '@/lib/trpc/client';

const COOKIE_NAME = 'sweetcms_ref';

function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function clearCookie(name: string) {
  document.cookie = `${name}=; path=/; max-age=0`;
}

/**
 * 1. Captures affiliate referral code from ?ref= query param into a 30-day cookie.
 * 2. When a user is authenticated and the cookie exists, calls captureReferral to
 *    record the signup referral, then clears the cookie.
 *
 * Handles both email registration and social OAuth flows.
 * Renders nothing — drop into any layout.
 */
export function RefCookieCapture() {
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const capturedRef = useRef(false);
  const captureReferral = trpc.auth.captureReferral.useMutation();

  // Step 1: Capture ?ref= param into cookie
  useEffect(() => {
    const ref = searchParams.get('ref');
    if (ref && /^[a-z0-9]{1,50}$/i.test(ref)) {
      document.cookie = `${COOKIE_NAME}=${encodeURIComponent(ref)}; path=/; max-age=${30 * 24 * 60 * 60}; SameSite=Lax`;
    }
  }, [searchParams]);

  // Step 2: After auth, send referral to server and clear cookie
  useEffect(() => {
    if (!session?.user?.id || capturedRef.current) return;
    const refCode = getCookie(COOKIE_NAME);
    if (!refCode) return;

    capturedRef.current = true;
    clearCookie(COOKIE_NAME);
    captureReferral.mutate({ refCode });
  }, [session?.user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
