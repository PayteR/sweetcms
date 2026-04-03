'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

/**
 * Captures affiliate referral code from ?ref= query param and stores in a 30-day cookie.
 * Renders nothing — drop into any layout.
 */
export function RefCookieCapture() {
  const searchParams = useSearchParams();

  useEffect(() => {
    const ref = searchParams.get('ref');
    if (ref && /^[a-z0-9]{1,50}$/i.test(ref)) {
      document.cookie = `sweetcms_ref=${encodeURIComponent(ref)}; path=/; max-age=${30 * 24 * 60 * 60}; SameSite=Lax`;
    }
  }, [searchParams]);

  return null;
}
