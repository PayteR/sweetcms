import { cache } from 'react';
import { serverTRPC } from '@/lib/trpc/server';

/**
 * React.cache()-wrapped data fetchers for the catch-all route.
 *
 * Both generateMetadata and the page renderer call these functions
 * with the same arguments. React.cache() deduplicates within a single
 * request so the DB is only hit once per content item per page load.
 *
 * getCachedTRPC() ensures only one tRPC caller is constructed per
 * request — renderers should use this instead of importing serverTRPC
 * directly for additional queries (tags, related posts, etc.).
 *
 * Note: React.cache() memoizes by argument identity (Object.is for
 * primitives). Since all args here are strings/numbers, this works
 * correctly. Preview requests use different args (previewToken) so
 * they correctly bypass the metadata cache entry.
 */

/** Cached tRPC caller — one instance per request. */
export const getCachedTRPC = cache(async () => {
  return serverTRPC();
});

export const getCachedPost = cache(
  async (slug: string, type: number, lang: string, previewToken?: string) => {
    const api = await getCachedTRPC();
    return api.cms.getBySlug({ slug, type, lang, previewToken });
  }
);

export const getCachedTag = cache(async (slug: string, lang: string) => {
  const api = await getCachedTRPC();
  return api.tags.getBySlug({ slug, lang });
});

export const getCachedPortfolio = cache(
  async (slug: string, lang: string, previewToken?: string) => {
    const api = await getCachedTRPC();
    return api.portfolio.getBySlug({ slug, lang, previewToken });
  }
);

export const getCachedCategory = cache(async (slug: string, lang: string) => {
  const api = await getCachedTRPC();
  return api.categories.getBySlug({ slug, lang });
});
