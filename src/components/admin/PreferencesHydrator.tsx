'use client';

import { useEffect, useRef } from 'react';

import { trpc } from '@/lib/trpc/client';
import { usePreferencesStore } from '@/engine/store/preferences-store';
import { useThemeStore } from '@/engine/store/theme-store';

const ADMIN_THEME_KEY = 'sweetcms-theme-admin';

/**
 * Hydrates the preferences Zustand store from the DB via tRPC.
 * Also syncs the admin theme preference from DB → localStorage for cross-device consistency.
 * Renders nothing — mount once in the dashboard layout.
 */
export function PreferencesHydrator() {
  const didHydrate = useRef(false);
  const hydrate = usePreferencesStore((s) => s.hydrate);
  const utils = trpc.useUtils();
  const setTheme = useThemeStore((s) => s.setTheme);

  const { data } = trpc.users.getPreferences.useQuery(undefined, {
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  useEffect(() => {
    if (!data || didHydrate.current) return;
    didHydrate.current = true;

    hydrate(data, (key: string, value: unknown) => {
      // Fire-and-forget DB persist
      utils.client.users.setPreference.mutate({ key, value }).catch((err: unknown) => {
        console.warn('[Preferences] Failed to persist preference', key, err);
      });
    });

    // Sync DB theme → localStorage (DB wins for cross-device consistency)
    const dbTheme = (data as Record<string, unknown>)?.['theme.admin'] as string | undefined;
    if (dbTheme && (dbTheme === 'light' || dbTheme === 'dark' || dbTheme === 'system')) {
      const localTheme = localStorage.getItem(ADMIN_THEME_KEY);
      if (localTheme !== dbTheme) {
        setTheme(dbTheme);
      }
    }
  }, [data, hydrate, utils, setTheme]);

  return null;
}
