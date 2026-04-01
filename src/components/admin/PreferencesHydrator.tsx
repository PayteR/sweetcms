'use client';

import { useEffect, useRef } from 'react';

import { trpc } from '@/lib/trpc/client';
import { usePreferencesStore } from '@/engine/store/preferences-store';

/**
 * Hydrates the preferences Zustand store from the DB via tRPC.
 * Renders nothing — mount once in the dashboard layout.
 */
export function PreferencesHydrator() {
  const didHydrate = useRef(false);
  const hydrate = usePreferencesStore((s) => s.hydrate);
  const utils = trpc.useUtils();

  const { data } = trpc.users.getPreferences.useQuery(undefined, {
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  useEffect(() => {
    if (!data || didHydrate.current) return;
    didHydrate.current = true;

    hydrate(data, (key: string, value: unknown) => {
      // Fire-and-forget DB persist
      utils.client.users.setPreference.mutate({ key, value }).catch(() => {
        // Silently fail — preferences are non-critical
      });
    });
  }, [data, hydrate, utils]);

  return null;
}
